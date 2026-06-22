import json
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.app_settings import AppSettings
from app.api.auth_routes import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/telefonia", tags=["telefonia"])


class TelefoniaSettings(BaseModel):
    tma: str = ""
    ligacoes: dict[str, int] = {}


@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = {
        r.key: r.value
        for r in db.query(AppSettings).filter(
            AppSettings.key.in_(["telefonia_tma", "telefonia_ligacoes"])
        ).all()
    }
    return {
        "tma": rows.get("telefonia_tma", ""),
        "ligacoes": json.loads(rows["telefonia_ligacoes"]) if rows.get("telefonia_ligacoes") else {},
    }


@router.put("/settings")
def save_settings(
    body: TelefoniaSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pairs = [
        ("telefonia_tma", body.tma),
        ("telefonia_ligacoes", json.dumps(body.ligacoes, ensure_ascii=False)),
    ]
    for key, value in pairs:
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))
    db.commit()
    return {"success": True}
