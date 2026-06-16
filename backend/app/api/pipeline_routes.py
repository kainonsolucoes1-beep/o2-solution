from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])

PENDENTE_STATUSES    = ("pending", "novo", "new")
AGENDADO_STATUSES    = ("scheduled", "qualificado", "qualified")
PROPOSTA_STATUSES    = ("proposal_sent",)
FECHADO_STATUSES     = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
PERDIDO_STATUSES     = ("sale_not_performed",)
HOT_WARM_PERCEPTIONS = ("Quente", "Morno")


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _status_in(statuses):
    return or_(*[func.lower(Lead.status) == s.lower() for s in statuses])


def _apply_filters(q, date_from: Optional[str], date_to: Optional[str], source: Optional[str]):
    if date_from:
        try:
            q = q.filter(Lead.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
        except ValueError:
            pass
    if date_to:
        try:
            q = q.filter(Lead.created_at < datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1))
        except ValueError:
            pass
    if source:
        q = q.filter(Lead.origin == source)
    return q


def _count_status(db: Session, statuses, date_from=None, date_to=None, source=None) -> int:
    q = db.query(func.count(Lead.id)).filter(_status_in(statuses))
    return _apply_filters(q, date_from, date_to, source).scalar() or 0


def _count_perception(db: Session, perceptions, date_from=None, date_to=None, source=None) -> int:
    q = db.query(func.count(Lead.id)).filter(Lead.perception.in_(list(perceptions)))
    return _apply_filters(q, date_from, date_to, source).scalar() or 0


@router.get("/overview")
def pipeline_overview(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "novo":        _count_status(db, PENDENTE_STATUSES, date_from, date_to, source),
        "qualificado": _count_perception(db, HOT_WARM_PERCEPTIONS, date_from, date_to, source),
        "proposta":    _count_status(db, PROPOSTA_STATUSES, date_from, date_to, source),
        "fechado":     _count_status(db, FECHADO_STATUSES, date_from, date_to, source),
        "perdido":     _count_status(db, PERDIDO_STATUSES, date_from, date_to, source),
    }


@router.get("/funnel")
def pipeline_funnel(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pendente = _count_status(db, PENDENTE_STATUSES, date_from, date_to, source)
    agendado = _count_status(db, AGENDADO_STATUSES, date_from, date_to, source)
    proposta = _count_status(db, PROPOSTA_STATUSES, date_from, date_to, source)
    fechado  = _count_status(db, FECHADO_STATUSES,  date_from, date_to, source)
    perdido  = _count_status(db, PERDIDO_STATUSES,  date_from, date_to, source)
    total = pendente + agendado + proposta + fechado + perdido

    def pct(n):
        return round(n / total * 100, 1) if total > 0 else 0.0

    return {
        "stages": [
            {"stage": "Pendente",         "count": pendente, "percentage": pct(pendente)},
            {"stage": "Agendado",         "count": agendado, "percentage": pct(agendado)},
            {"stage": "Proposta Enviada", "count": proposta, "percentage": pct(proposta)},
            {"stage": "Venda Realizada",  "count": fechado,  "percentage": pct(fechado)},
            {"stage": "Perdido",          "count": perdido,  "percentage": pct(perdido)},
        ]
    }


@router.get("/alerts")
def pipeline_alerts(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    cutoff_24h = now - timedelta(hours=24)

    vq = db.query(Lead).filter(Lead.updated_at <= cutoff_24h)
    vq = _apply_filters(vq, date_from, date_to, source)
    vencidos_rows = vq.order_by(Lead.updated_at.asc()).limit(10).all()

    uq = db.query(Lead).filter(_status_in(PENDENTE_STATUSES), Lead.updated_at <= cutoff_24h)
    uq = _apply_filters(uq, date_from, date_to, source)
    uncontacted_rows = uq.order_by(Lead.updated_at.asc()).limit(10).all()

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
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    cutoff_5d = now - timedelta(days=5)

    ct_q = db.query(func.count(Lead.id)).filter(_status_in(PENDENTE_STATUSES), Lead.created_at >= today_start)
    call_today = _apply_filters(ct_q, date_from, date_to, source).scalar() or 0

    se_q = db.query(func.count(Lead.id)).filter(_status_in(AGENDADO_STATUSES))
    send_email = _apply_filters(se_q, date_from, date_to, source).scalar() or 0

    fp_q = db.query(func.count(Lead.id)).filter(_status_in(PROPOSTA_STATUSES), Lead.created_at <= cutoff_5d)
    follow_proposal = _apply_filters(fp_q, date_from, date_to, source).scalar() or 0

    return {"call_today": call_today, "send_email": send_email, "follow_proposal": follow_proposal}


@router.get("/top-sources")
def pipeline_top_sources(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Lead.origin, func.count(Lead.id).label("count"))
    q = _apply_filters(q, date_from, date_to, source)
    rows = (
        q.filter(Lead.origin.isnot(None), Lead.origin != "", Lead.origin != "Sem origem")
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .limit(5)
        .all()
    )
    return {"sources": [{"name": r.origin, "count": r.count} for r in rows]}
