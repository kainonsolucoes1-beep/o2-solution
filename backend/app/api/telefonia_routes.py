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
    ligacoes: dict[str, int] = {}
    atendimentos: dict[str, str] = {}


def _calc_tma(ligacoes: dict, atendimentos: dict) -> str:
    total_seconds = 0
    total_calls = 0
    for name, calls in ligacoes.items():
        t = atendimentos.get(name, "")
        if not t or calls <= 0:
            continue
        parts = t.strip().split(":")
        if len(parts) != 3:
            continue
        try:
            secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            total_seconds += secs
            total_calls += calls
        except ValueError:
            continue
    if total_calls == 0:
        return "—"
    avg = total_seconds / total_calls
    mins = int(avg) // 60
    secs = int(avg) % 60
    return f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"


@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = {
        r.key: r.value
        for r in db.query(AppSettings).filter(
            AppSettings.key.in_(["telefonia_ligacoes", "telefonia_atendimentos"])
        ).all()
    }
    ligacoes = json.loads(rows["telefonia_ligacoes"]) if rows.get("telefonia_ligacoes") else {}
    atendimentos = json.loads(rows["telefonia_atendimentos"]) if rows.get("telefonia_atendimentos") else {}
    return {
        "tma": _calc_tma(ligacoes, atendimentos),
        "ligacoes": ligacoes,
        "atendimentos": atendimentos,
    }


@router.put("/settings")
def save_settings(
    body: TelefoniaSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pairs = [
        ("telefonia_ligacoes",     json.dumps(body.ligacoes,     ensure_ascii=False)),
        ("telefonia_atendimentos", json.dumps(body.atendimentos, ensure_ascii=False)),
    ]
    for key, value in pairs:
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))
    db.commit()
    return {"success": True}
