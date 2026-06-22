from typing import List

import bcrypt as _bcrypt
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import User
from app.models.app_settings import AppSettings
from app.models.form_user import FormUser
from app.schemas.form_user import FormUserCreate, FormUserResponse, FormUserUpdate

router = APIRouter(prefix="/api/v1", tags=["forms"])


def _require_admin(user: User):
    if user.role != "admin" and user.username != "lucas@o2solution.com.br":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")


def _get_credentials_key(db: Session) -> str:
    row = db.query(AppSettings).filter(AppSettings.key == "forms_credentials_key").first()
    return row.value if row else ""


# ── Admin CRUD ────────────────────────────────────────────────────────────────

@router.get("/admin/form-users", response_model=List[FormUserResponse])
def list_form_users(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    return db.query(FormUser).order_by(FormUser.first_name).all()


@router.post("/admin/form-users", response_model=FormUserResponse, status_code=201)
def create_form_user(
    body: FormUserCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    if db.query(FormUser).filter(FormUser.username == body.username).first():
        raise HTTPException(status_code=409, detail="Username já cadastrado")
    fu = FormUser(
        username=body.username,
        first_name=body.first_name,
        last_name=body.last_name,
        email=body.email,
        password_hash=_bcrypt.hashpw(body.password.encode(), _bcrypt.gensalt()).decode(),
    )
    db.add(fu)
    db.commit()
    db.refresh(fu)
    return fu


@router.patch("/admin/form-users/{user_id}", response_model=FormUserResponse)
def update_form_user(
    user_id: str,
    body: FormUserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    fu = db.query(FormUser).filter(FormUser.id == user_id).first()
    if not fu:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    if body.first_name is not None:
        fu.first_name = body.first_name
    if body.last_name is not None:
        fu.last_name = body.last_name
    if body.email is not None:
        fu.email = body.email
    if body.is_active is not None:
        fu.is_active = body.is_active
    if body.password:
        fu.password_hash = _bcrypt.hashpw(body.password.encode(), _bcrypt.gensalt()).decode()
    db.commit()
    db.refresh(fu)
    return fu


# ── Public credentials endpoint (consumed by formulario_leads.py) ─────────────

@router.get("/forms/credentials")
def get_form_credentials(
    key: str = Query(...),
    db: Session = Depends(get_db),
):
    expected = _get_credentials_key(db)
    if not expected or key != expected:
        raise HTTPException(status_code=403, detail="Chave inválida")

    users = db.query(FormUser).filter(FormUser.is_active.is_(True)).all()
    credentials = {
        "usernames": {
            fu.username: {
                "email": fu.email,
                "name": f"{fu.first_name} {fu.last_name}".strip(),
                "first_name": fu.first_name,
                "last_name": fu.last_name or "",
                "password": fu.password_hash,
            }
            for fu in users
        }
    }
    return credentials
