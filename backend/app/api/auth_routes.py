import time
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Depends, Header, Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import UserLogin, TokenResponse, UserResponse
from app.security import verify_password, create_access_token, verify_token, can_see_restricted_leads

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

_LOGIN_RATE_WINDOW = 300
_LOGIN_RATE_MAX = 8
_login_attempts: dict[str, deque] = defaultdict(deque)


def _check_login_rate_limit(ip: str):
    now = time.time()
    hits = _login_attempts[ip]
    while hits and now - hits[0] > _LOGIN_RATE_WINDOW:
        hits.popleft()
    if len(hits) >= _LOGIN_RATE_MAX:
        raise HTTPException(status_code=429, detail="Muitas tentativas de login. Tente novamente em alguns minutos.")
    hits.append(now)


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

    # liga o filtro global de leads ADM-only pro resto da sessao desta requisicao
    db.info["restrict_admin_leads"] = not can_see_restricted_leads(user)

    return user

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    _check_login_rate_limit(request.client.host if request.client else "unknown")

    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou senha inválidos")

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return current_user
