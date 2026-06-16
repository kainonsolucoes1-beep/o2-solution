from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import User
from app.models.app_settings import AppSettings
from app.sync_followize import update_tokens_in_memory

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(user: User):
    if user.role != "admin" and user.username != "lucas":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")


class TokenUpdateRequest(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/followize-tokens")
def update_followize_tokens(
    body: TokenUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)

    for key, value in [
        ("followize_access_token", body.access_token),
        ("followize_refresh_token", body.refresh_token),
    ]:
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))

    db.commit()
    update_tokens_in_memory(body.access_token, body.refresh_token)

    return {"success": True}
