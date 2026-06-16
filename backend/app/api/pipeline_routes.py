from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])

# Status reais da API Followize (+ fallbacks legados do banco)
PENDENTE_STATUSES   = ("pending", "novo", "new")
AGENDADO_STATUSES   = ("scheduled", "qualificado", "qualified")
PROPOSTA_STATUSES   = ("proposal_sent",)
FECHADO_STATUSES    = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")

# Percepções armazenadas no banco (mapeadas pelo sync)
HOT_WARM_PERCEPTIONS = ("Quente", "Morno")


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _status_in(statuses):
    return or_(*[func.lower(Lead.status) == s.lower() for s in statuses])


def _count_status(db: Session, statuses) -> int:
    return db.query(func.count(Lead.id)).filter(_status_in(statuses)).scalar() or 0


def _count_perception(db: Session, perceptions) -> int:
    return db.query(func.count(Lead.id)).filter(Lead.perception.in_(list(perceptions))).scalar() or 0


@router.get("/overview")
def pipeline_overview(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "novo":        _count_status(db, PENDENTE_STATUSES),
        "qualificado": _count_perception(db, HOT_WARM_PERCEPTIONS),
        "proposta":    _count_status(db, PROPOSTA_STATUSES),
        "fechado":     _count_status(db, FECHADO_STATUSES),
    }


@router.get("/funnel")
def pipeline_funnel(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pendente  = _count_status(db, PENDENTE_STATUSES)
    agendado  = _count_status(db, AGENDADO_STATUSES)
    proposta  = _count_status(db, PROPOSTA_STATUSES)
    fechado   = _count_status(db, FECHADO_STATUSES)
    total = pendente + agendado + proposta + fechado

    def pct(n):
        return round(n / total * 100, 1) if total > 0 else 0.0

    return {
        "stages": [
            {"stage": "Pendente",        "count": pendente, "percentage": pct(pendente)},
            {"stage": "Agendado",        "count": agendado, "percentage": pct(agendado)},
            {"stage": "Proposta Enviada","count": proposta, "percentage": pct(proposta)},
            {"stage": "Venda Realizada", "count": fechado,  "percentage": pct(fechado)},
        ]
    }


@router.get("/alerts")
def pipeline_alerts(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    cutoff_24h = now - timedelta(hours=24)

    vencidos_rows = (
        db.query(Lead)
        .filter(Lead.updated_at <= cutoff_24h)
        .order_by(Lead.updated_at.asc())
        .limit(10)
        .all()
    )

    uncontacted_rows = (
        db.query(Lead)
        .filter(_status_in(PENDENTE_STATUSES))
        .filter(Lead.updated_at <= cutoff_24h)
        .order_by(Lead.updated_at.asc())
        .limit(10)
        .all()
    )

    return {
        "vencidos": [
            {
                "id": str(r.id),
                "name": r.name,
                "hours_without_action": int((now - r.updated_at).total_seconds() / 3600) if r.updated_at else 0,
                "status": r.status,
            }
            for r in vencidos_rows
        ],
        "uncontacted": [
            {
                "id": str(r.id),
                "name": r.name,
                "hours_without_action": int((now - r.updated_at).total_seconds() / 3600) if r.updated_at else 0,
                "last_action": r.updated_at.isoformat() if r.updated_at else None,
            }
            for r in uncontacted_rows
        ],
    }


@router.get("/next-actions")
def pipeline_next_actions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff_5d = now - timedelta(days=5)

    call_today = (
        db.query(func.count(Lead.id))
        .filter(_status_in(PENDENTE_STATUSES))
        .filter(Lead.created_at >= today_start)
        .scalar() or 0
    )

    send_email = (
        db.query(func.count(Lead.id))
        .filter(_status_in(AGENDADO_STATUSES))
        .scalar() or 0
    )

    follow_proposal = (
        db.query(func.count(Lead.id))
        .filter(_status_in(PROPOSTA_STATUSES))
        .filter(Lead.created_at <= cutoff_5d)
        .scalar() or 0
    )

    return {"call_today": call_today, "send_email": send_email, "follow_proposal": follow_proposal}


@router.get("/analytics")
def pipeline_analytics(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    total    = db.query(func.count(Lead.id)).scalar() or 0
    pendente = _count_status(db, PENDENTE_STATUSES)
    agendado = _count_status(db, AGENDADO_STATUSES)
    proposta = _count_status(db, PROPOSTA_STATUSES)
    fechado  = _count_status(db, FECHADO_STATUSES)

    conversion_rate = round(fechado / total * 100, 1) if total > 0 else 0.0

    p_base = pendente + agendado + proposta + fechado
    a_base = agendado + proposta + fechado
    pr_base = proposta + fechado

    nq = round(a_base  / p_base  * 100, 1) if p_base  > 0 else 0.0
    qp = round(pr_base / a_base  * 100, 1) if a_base  > 0 else 0.0
    pf = round(fechado / pr_base * 100, 1) if pr_base > 0 else 0.0

    fechado_leads = (
        db.query(Lead.created_at, Lead.updated_at)
        .filter(_status_in(FECHADO_STATUSES))
        .filter(Lead.updated_at.isnot(None), Lead.created_at.isnot(None))
        .all()
    )

    if fechado_leads:
        days_list = [(r.updated_at - r.created_at).days for r in fechado_leads if r.updated_at and r.created_at]
        avg_days = round(sum(days_list) / len(days_list), 1) if days_list else 0.0
    else:
        avg_days = 0.0

    return {
        "avg_time_in_pipeline": avg_days,
        "conversion_rate": conversion_rate,
        "stage_conversion": {
            "pendente_to_agendado": nq,
            "agendado_to_proposta": qp,
            "proposta_to_fechado":  pf,
        },
    }
