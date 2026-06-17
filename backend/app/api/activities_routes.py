from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User

router = APIRouter(prefix="/api/v1/activities", tags=["activities"])

_PENDENTE    = ("pending", "novo", "new")
_QUALIFICADO = ("scheduled", "qualificado", "qualified")
_PROPOSTA    = ("proposal_sent",)


def _s_in(statuses):
    return or_(*[func.lower(Lead.status) == s.lower() for s in statuses])


@router.get("/next-actions")
def activities_next_actions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff_5d = now - timedelta(days=5)

    call_today     = db.query(func.count(Lead.id)).filter(_s_in(_PENDENTE), Lead.created_at >= today_start).scalar() or 0
    send_email     = db.query(func.count(Lead.id)).filter(_s_in(_QUALIFICADO)).scalar() or 0
    follow_proposal = db.query(func.count(Lead.id)).filter(_s_in(_PROPOSTA), Lead.created_at <= cutoff_5d).scalar() or 0

    return {"call_today": call_today, "send_email": send_email, "follow_proposal": follow_proposal, "meetings": 0}


@router.get("/list")
def activities_list(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    leads = (
        db.query(Lead)
        .filter(or_(_s_in(_PENDENTE), _s_in(_QUALIFICADO), _s_in(_PROPOSTA)))
        .order_by(Lead.updated_at.asc())
        .limit(50)
        .all()
    )

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    def action_label(status: Optional[str]) -> str:
        s = (status or "").lower()
        if s in [x.lower() for x in _PENDENTE]:
            return "Ligar"
        if s in [x.lower() for x in _QUALIFICADO]:
            return "Enviar Email"
        if s in [x.lower() for x in _PROPOSTA]:
            return "Seguir Proposta"
        return "Contatar"

    return {
        "leads": [
            {
                "id": str(l.id),
                "name": l.name,
                "created_at": l.created_at.isoformat() if l.created_at else None,
                "status": l.status,
                "action": action_label(l.status),
                "attendant": l.attendant or "—",
                "hours_idle": int((now - l.updated_at).total_seconds() / 3600) if l.updated_at else 0,
                "origin": l.origin or "—",
            }
            for l in leads
        ]
    }
