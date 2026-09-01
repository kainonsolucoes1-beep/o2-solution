import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.models.login_event import LoginEvent
from app.access_policy import check_time_window
from app.request_utils import client_ip
from app.schemas import UserLogin, TokenResponse, UserResponse, ChangePasswordRequest
from app.security import verify_password, create_access_token, verify_token, can_see_restricted_leads, team_scope, restrict_to_usuario_leads, hash_password

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_LOGIN_RATE_WINDOW = 300
_LOGIN_RATE_MAX = 10
_login_failures: dict[str, deque] = defaultdict(deque)


def _check_login_rate_limit(ip: str):
    # só falhas contam — o escritório inteiro sai de um IP só (NAT), logins
    # bem-sucedidos em massa não podem estourar o limite.
    now = time.time()
    hits = _login_failures[ip]
    while hits and now - hits[0] > _LOGIN_RATE_WINDOW:
        hits.popleft()
    if len(hits) >= _LOGIN_RATE_MAX:
        raise HTTPException(status_code=429, detail="Muitas tentativas de login. Tente novamente em alguns minutos.")


def _record_login_failure(ip: str):
    _login_failures[ip].append(time.time())


def get_current_user(authorization: str = Header(None), db: Session = Depends(get_db)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Authorization header não fornecido")
    
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise HTTPException(status_code=401, detail="Formato inválido: Bearer <token>")
    
    token = parts[1]
    user_id = verify_token(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Token inválido ou expirado")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")

    check_time_window(user, db)

    # liga o filtro global de leads ADM-only pro resto da sessao desta requisicao
    db.info["restrict_admin_leads"] = not can_see_restricted_leads(user)
    db.info["restrict_team"] = team_scope(user)
    db.info["restrict_to_usuario_leads"] = restrict_to_usuario_leads(user)
    # nome do proprio usuario -- usado pelo filtro de comercial em database.py
    # pra nao esconder os leads que ja eram dele antes da troca de perfil
    db.info["own_origin_name"] = user.first_name or user.username

    return user

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    ip = client_ip(request)
    _check_login_rate_limit(ip)
    ua = (request.headers.get("user-agent") or "")[:400]

    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        _record_login_failure(ip)
        db.add(LoginEvent(user_id=user.id if user else None, email_tried=credentials.email, success=False, ip=ip, user_agent=ua))
        db.commit()
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    try:
        check_time_window(user, db)
    except HTTPException as exc:
        db.add(LoginEvent(user_id=user.id, email_tried=credentials.email, success=False, ip=ip, user_agent=ua))
        db.commit()
        raise exc

    seen_ip = db.query(LoginEvent.id).filter(
        LoginEvent.user_id == user.id, LoginEvent.success.is_(True), LoginEvent.ip == ip
    ).first() is not None
    db.add(LoginEvent(user_id=user.id, email_tried=credentials.email, success=True, ip=ip, user_agent=ua, new_ip=not seen_ip))
    user.last_login_at = datetime.now(timezone.utc).replace(tzinfo=None)
    user.last_login_ip = ip
    db.commit()

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer", "must_change_password": user.must_change_password}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta")
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="A nova senha precisa ter pelo menos 8 caracteres")
    current_user.password_hash = hash_password(body.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"success": True}
