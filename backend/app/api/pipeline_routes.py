from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadStatusHistory
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


def _sum_value(db: Session, extra_filters, date_from=None, date_to=None, source=None) -> float:
    q = db.query(func.coalesce(func.sum(Lead.value_potential), 0)).filter(*extra_filters)
    return float(_apply_filters(q, date_from, date_to, source).scalar() or 0.0)


@router.get("/overview")
def pipeline_overview(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    neg_q = db.query(func.count(Lead.id)).filter(
        Lead.perception.in_(list(HOT_WARM_PERCEPTIONS)),
        ~_status_in(FECHADO_STATUSES),
        ~_status_in(PERDIDO_STATUSES),
    )
    negociacao = _apply_filters(neg_q, date_from, date_to, source).scalar() or 0

    neg_val_q = db.query(func.coalesce(func.sum(Lead.value_potential), 0)).filter(
        Lead.perception.in_(list(HOT_WARM_PERCEPTIONS)),
        ~_status_in(FECHADO_STATUSES),
        ~_status_in(PERDIDO_STATUSES),
    )
    negociacao_value = float(_apply_filters(neg_val_q, date_from, date_to, source).scalar() or 0.0)

    return {
        "novo":        _count_status(db, PENDENTE_STATUSES,  date_from, date_to, source),
        "qualificado": _count_status(db, AGENDADO_STATUSES,  date_from, date_to, source),
        "proposta":    _count_status(db, PROPOSTA_STATUSES,  date_from, date_to, source),
        "negociacao":  negociacao,
        "fechado":     _count_status(db, FECHADO_STATUSES,   date_from, date_to, source),
        "perdido":     _count_status(db, PERDIDO_STATUSES,   date_from, date_to, source),
        "novo_value":        _sum_value(db, [_status_in(PENDENTE_STATUSES)],  date_from, date_to, source),
        "qualificado_value": _sum_value(db, [_status_in(AGENDADO_STATUSES)],  date_from, date_to, source),
        "proposta_value":    _sum_value(db, [_status_in(PROPOSTA_STATUSES)],  date_from, date_to, source),
        "negociacao_value":  negociacao_value,
        "fechado_value":     _sum_value(db, [_status_in(FECHADO_STATUSES)],   date_from, date_to, source),
        "perdido_value":     _sum_value(db, [_status_in(PERDIDO_STATUSES)],   date_from, date_to, source),
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

    _vencidos_statuses = PENDENTE_STATUSES + ("qualificado", "qualified") + PROPOSTA_STATUSES
    active_filter = or_(
        _status_in(_vencidos_statuses),
        Lead.perception.in_(list(HOT_WARM_PERCEPTIONS)),
    )

    vencidos_count = _apply_filters(
        db.query(func.count(Lead.id)).filter(Lead.updated_at <= cutoff_24h, active_filter),
        date_from, date_to, source,
    ).scalar() or 0
    uncontacted_count = _apply_filters(
        db.query(func.count(Lead.id)).filter(_status_in(PENDENTE_STATUSES), Lead.updated_at <= cutoff_24h),
        date_from, date_to, source,
    ).scalar() or 0

    vq = db.query(Lead).filter(Lead.updated_at <= cutoff_24h, active_filter)
    vq = _apply_filters(vq, date_from, date_to, source)
    vencidos_rows = vq.order_by(Lead.updated_at.asc()).limit(10).all()

    uq = db.query(Lead).filter(_status_in(PENDENTE_STATUSES), Lead.updated_at <= cutoff_24h)
    uq = _apply_filters(uq, date_from, date_to, source)
    uncontacted_rows = uq.order_by(Lead.updated_at.asc()).limit(10).all()

    terminal_rows = _apply_filters(
        db.query(Lead.created_at, Lead.updated_at).filter(
            _status_in(FECHADO_STATUSES + PERDIDO_STATUSES),
            Lead.created_at.isnot(None),
            Lead.updated_at.isnot(None),
        ),
        date_from, date_to, source,
    ).all()
    times = [
        (r.updated_at - r.created_at).total_seconds() / 86400
        for r in terminal_rows
        if r.updated_at > r.created_at
    ]
    avg_time_in_funnel = round(sum(times) / len(times), 1) if times else 0.0

    # Desempenho no atendimento: tempo médio de 1° contato manual
    first_contact_subq = (
        db.query(
            LeadStatusHistory.lead_id,
            func.min(LeadStatusHistory.changed_at).label('first_contact_at'),
        )
        .filter(LeadStatusHistory.changed_by != 'Followize')
        .group_by(LeadStatusHistory.lead_id)
        .subquery()
    )
    contact_rows = _apply_filters(
        db.query(
            func.extract('epoch', first_contact_subq.c.first_contact_at - Lead.created_at) / 3600
        )
        .join(first_contact_subq, Lead.id == first_contact_subq.c.lead_id)
        .filter(first_contact_subq.c.first_contact_at > Lead.created_at),
        date_from, date_to, source,
    ).all()
    hours_list = [float(r[0]) for r in contact_rows if r[0] is not None and float(r[0]) > 0]
    avg_first_contact_hours = round(sum(hours_list) / len(hours_list), 1) if hours_list else 0.0

    contacted_count = _apply_filters(
        db.query(func.count(func.distinct(Lead.id)))
        .join(first_contact_subq, Lead.id == first_contact_subq.c.lead_id),
        date_from, date_to, source,
    ).scalar() or 0

    return {
        "vencidos_count": vencidos_count,
        "uncontacted_count": uncontacted_count,
        "avg_time_in_funnel": avg_time_in_funnel,
        "avg_first_contact_hours": avg_first_contact_hours,
        "contacted_count": int(contacted_count),
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


@router.get("/revenue-by-source")
def pipeline_revenue_by_source(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(
        Lead.origin,
        func.count(Lead.id).label("cnt"),
        func.sum(Lead.value_potential).label("revenue"),
    )
    q = _apply_filters(q, date_from, date_to, source)
    rows = (
        q.filter(Lead.origin.isnot(None), Lead.origin != "", Lead.origin != "Sem origem")
        .group_by(Lead.origin)
        .order_by(func.sum(Lead.value_potential).desc())
        .limit(10)
        .all()
    )
    result = []
    for r in rows:
        total = float(r.revenue or 0)
        count = int(r.cnt or 0)
        result.append({
            "name": r.origin,
            "total_revenue": total,
            "leads_count": count,
            "average_ticket": round(total / count, 2) if count else 0.0,
        })
    return {"sources": result}


@router.get("/source-details/{source_name}")
def pipeline_source_details(
    source_name: str,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    agg = _apply_filters(
        db.query(func.count(Lead.id).label("cnt"), func.sum(Lead.value_potential).label("revenue")),
        date_from, date_to, source_name,
    ).first()
    total_revenue = float(agg.revenue or 0)
    leads_count   = int(agg.cnt or 0)

    active_q = db.query(func.count(Lead.id)).filter(
        ~_status_in(PERDIDO_STATUSES),
        ~_status_in(FECHADO_STATUSES),
    )
    active_leads = _apply_filters(active_q, date_from, date_to, source_name).scalar() or 0

    time_rows = _apply_filters(
        db.query(Lead.created_at, Lead.updated_at),
        date_from, date_to, source_name,
    ).all()
    times = [
        (r.updated_at - r.created_at).total_seconds() / 86400
        for r in time_rows
        if r.updated_at and r.created_at and r.updated_at > r.created_at
    ]
    avg_time = round(sum(times) / len(times), 1) if times else 0.0

    return {
        "name": source_name,
        "total_revenue": total_revenue,
        "leads_count": leads_count,
        "average_ticket": round(total_revenue / leads_count, 2) if leads_count else 0.0,
        "active_leads": active_leads,
        "average_time_in_pipeline": avg_time,
        "distribution_by_status": {
            "Pendente": _count_status(db, PENDENTE_STATUSES, date_from, date_to, source_name),
            "Agendado": _count_status(db, AGENDADO_STATUSES, date_from, date_to, source_name),
            "Proposta": _count_status(db, PROPOSTA_STATUSES, date_from, date_to, source_name),
            "Venda":    _count_status(db, FECHADO_STATUSES,  date_from, date_to, source_name),
            "Perdido":  _count_status(db, PERDIDO_STATUSES,  date_from, date_to, source_name),
        },
    }
