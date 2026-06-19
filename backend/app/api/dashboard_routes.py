import os
import calendar as _cal
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func, cast, Date, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadStatusHistory
from app.models.user import User
from app.schemas.dashboard import (
    TodayMetrics,
    TopOperatorsResponse,
    OperatorLeadsToday,
    Last7DaysResponse,
    DayLeads,
    OperatorsRankingResponse,
    OperatorRanking,
    DailyCaptureResponse,
    OperatorCapture,
)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

META_DAILY = int(os.getenv("META_DAILY", 10))
META_MONTHLY = int(os.getenv("META_MONTHLY", 200))
QUALIFIED_STATUSES = ("qualificado", "qualified", "convertido")

_PENDENTE    = ("pending", "novo", "new")
_QUALIFICADO = ("scheduled", "qualificado", "qualified")
_PROPOSTA    = ("proposal_sent",)
_FECHADO     = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
_PERDIDO     = ("sale_not_performed",)


def _s_in(statuses):
    return or_(*[func.lower(Lead.status) == s.lower() for s in statuses])


def _today_range() -> tuple[datetime, datetime]:
    """Retorna (today_start, today_end) em UTC para filtros de intervalo."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    return today_start, today_end


@router.get("/today-metrics", response_model=TodayMetrics)
def today_metrics(db: Session = Depends(get_db)):
    today_start, today_end = _today_range()
    month_start = today_start.replace(day=1)

    leads_today = (
        db.query(func.count(Lead.id))
        .filter(Lead.created_at >= today_start)
        .filter(Lead.created_at < today_end)
        .scalar() or 0
    )

    leads_monthly = (
        db.query(func.count(Lead.id))
        .filter(Lead.created_at >= month_start)
        .scalar() or 0
    )

    value_pipeline = (
        db.query(func.coalesce(func.sum(Lead.value_potential), 0))
        .filter(Lead.created_at >= month_start)
        .scalar() or 0.0
    )

    average_ticket = (
        db.query(func.coalesce(func.avg(Lead.value_potential), 0))
        .filter(Lead.created_at >= month_start)
        .filter(Lead.value_potential.isnot(None))
        .scalar() or 0.0
    )

    qualified_leads = (
        db.query(func.count(Lead.id))
        .filter(Lead.created_at >= today_start)
        .filter(Lead.created_at < today_end)
        .filter(Lead.status.in_(QUALIFIED_STATUSES))
        .scalar() or 0
    )

    conversion_rate = round((qualified_leads / leads_today * 100), 1) if leads_today else 0.0

    return TodayMetrics(
        leads_today=leads_today,
        meta_daily=META_DAILY,
        meta_monthly=META_MONTHLY,
        leads_monthly=leads_monthly,
        value_pipeline=float(value_pipeline),
        average_ticket=float(average_ticket),
        qualified_leads=qualified_leads,
        conversion_rate=conversion_rate,
    )


@router.get("/top-operators", response_model=TopOperatorsResponse)
def top_operators(db: Session = Depends(get_db)):
    today_start, today_end = _today_range()

    rows = (
        db.query(
            func.coalesce(Lead.origin, "Sem origem").label("name"),
            func.count(Lead.id).label("leads_today"),
        )
        .filter(Lead.created_at >= today_start)
        .filter(Lead.created_at < today_end)
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .limit(3)
        .all()
    )

    return TopOperatorsResponse(
        operators=[OperatorLeadsToday(name=r.name, leads_today=r.leads_today) for r in rows]
    )


@router.get("/last-7-days", response_model=Last7DaysResponse)
def last_7_days(db: Session = Depends(get_db)):
    today_start, _ = _today_range()
    week_start = today_start - timedelta(days=6)

    rows = (
        db.query(
            cast(Lead.created_at, Date).label("day"),
            func.count(Lead.id).label("leads"),
        )
        .filter(Lead.created_at >= week_start)
        .group_by(cast(Lead.created_at, Date))
        .order_by(cast(Lead.created_at, Date))
        .all()
    )

    counts = {str(r.day): r.leads for r in rows}
    days: List[DayLeads] = []
    for i in range(7):
        d = str((week_start + timedelta(days=i)).date())
        days.append(DayLeads(date=d, leads=counts.get(d, 0)))

    return Last7DaysResponse(days=days)


@router.get("/daily-capture", response_model=DailyCaptureResponse)
def daily_capture(db: Session = Depends(get_db)):
    today_start, today_end = _today_range()

    rows = (
        db.query(
            func.coalesce(Lead.origin, "Sem origem").label("name"),
            func.count(Lead.id).label("leads_today"),
        )
        .filter(Lead.created_at >= today_start)
        .filter(Lead.created_at < today_end)
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .all()
    )

    return DailyCaptureResponse(
        operators=[OperatorCapture(name=r.name, leads_today=r.leads_today) for r in rows]
    )


@router.get("/operators-ranking", response_model=OperatorsRankingResponse)
def operators_ranking(db: Session = Depends(get_db)):
    rows = (
        db.query(
            func.coalesce(Lead.origin, "Sem origem").label("name"),
            func.count(Lead.id).label("leads"),
            func.count(Lead.id)
            .filter(Lead.status.in_(QUALIFIED_STATUSES))
            .label("qualified"),
        )
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .limit(5)
        .all()
    )

    return OperatorsRankingResponse(
        ranking=[
            OperatorRanking(name=r.name, leads=r.leads, qualified=r.qualified)
            for r in rows
        ]
    )


@router.get("/kpis-overview")
def dashboard_kpis_overview(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    prev_month_end = month_start
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)

    def _count(statuses, start, end):
        return db.query(func.count(Lead.id)).filter(
            _s_in(statuses), Lead.created_at >= start, Lead.created_at < end
        ).scalar() or 0

    def _count_neg(start, end):
        return db.query(func.count(Lead.id)).filter(
            Lead.perception.in_(["Quente", "Morno"]),
            ~_s_in(_FECHADO), ~_s_in(_PERDIDO),
            Lead.created_at >= start, Lead.created_at < end,
        ).scalar() or 0

    def _pct(curr, prev):
        if prev == 0:
            return 100 if curr > 0 else 0
        return round((curr - prev) / prev * 100)

    end = now + timedelta(days=1)
    result = {}
    for name, statuses in [
        ("pendente", _PENDENTE), ("qualificado", _QUALIFICADO),
        ("proposta", _PROPOSTA), ("fechado", _FECHADO), ("perdido", _PERDIDO),
    ]:
        curr = _count(statuses, month_start, end)
        prev = _count(statuses, prev_month_start, prev_month_end)
        result[name] = {"count": curr, "vs_previous_month": _pct(curr, prev)}

    curr_neg = _count_neg(month_start, end)
    prev_neg = _count_neg(prev_month_start, prev_month_end)
    result["negociacao"] = {"count": curr_neg, "vs_previous_month": _pct(curr_neg, prev_neg)}
    return result


@router.get("/funnel-distribution")
def dashboard_funnel_distribution(db: Session = Depends(get_db)):
    def _n(statuses):
        return db.query(func.count(Lead.id)).filter(_s_in(statuses)).scalar() or 0

    pendente    = _n(_PENDENTE)
    qualificado = _n(_QUALIFICADO)
    proposta    = _n(_PROPOSTA)
    negociacao  = db.query(func.count(Lead.id)).filter(
        Lead.perception.in_(["Quente", "Morno"]), ~_s_in(_FECHADO), ~_s_in(_PERDIDO)
    ).scalar() or 0
    fechado = _n(_FECHADO)
    perdido = _n(_PERDIDO)
    total   = pendente + qualificado + proposta + negociacao + fechado + perdido

    def pct(n):
        return round(n / total * 100, 1) if total else 0.0

    return {"stages": [
        {"stage": "Pendente",    "count": pendente,    "percentage": pct(pendente),    "color": "#3B82F6"},
        {"stage": "Qualificado", "count": qualificado, "percentage": pct(qualificado), "color": "#10B981"},
        {"stage": "Proposta",    "count": proposta,    "percentage": pct(proposta),    "color": "#F59E0B"},
        {"stage": "Negociação",  "count": negociacao,  "percentage": pct(negociacao),  "color": "#8B5CF6"},
        {"stage": "Fechado",     "count": fechado,     "percentage": pct(fechado),     "color": "#059669"},
        {"stage": "Perdido",     "count": perdido,     "percentage": pct(perdido),     "color": "#EF4444"},
    ]}


@router.get("/funnel-conversions")
def dashboard_funnel_conversions(db: Session = Depends(get_db)):
    def _n(statuses):
        return db.query(func.count(Lead.id)).filter(_s_in(statuses)).scalar() or 0

    pendente    = _n(_PENDENTE)
    qualificado = _n(_QUALIFICADO)
    proposta    = _n(_PROPOSTA)
    negociacao  = db.query(func.count(Lead.id)).filter(
        Lead.perception.in_(["Quente", "Morno"]), ~_s_in(_FECHADO), ~_s_in(_PERDIDO)
    ).scalar() or 0
    fechado = _n(_FECHADO)

    total         = pendente + qualificado + proposta + negociacao + fechado + _n(_PERDIDO)
    qual_or_later = qualificado + proposta + negociacao + fechado
    prop_or_later = proposta + negociacao + fechado
    neg_or_later  = negociacao + fechado

    def rate(a, b):
        return round(a / b * 100, 1) if b else 0.0

    return {"conversions": [
        {"from": "Pendente",    "to": "Qualificado", "rate": rate(qual_or_later, total)},
        {"from": "Qualificado", "to": "Proposta",    "rate": rate(prop_or_later, qual_or_later)},
        {"from": "Proposta",    "to": "Negociação",  "rate": rate(neg_or_later, prop_or_later)},
        {"from": "Negociação",  "to": "Fechado",     "rate": rate(fechado, neg_or_later)},
    ]}


@router.get("/health-metrics")
def dashboard_health_metrics(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    vencidos = db.query(func.count(Lead.id)).filter(
        Lead.updated_at <= now - timedelta(days=7)
    ).scalar() or 0

    uncontacted = db.query(func.count(Lead.id)).filter(
        _s_in(_PENDENTE), Lead.updated_at <= now - timedelta(hours=24)
    ).scalar() or 0

    rows = db.query(Lead.created_at, Lead.updated_at).filter(
        Lead.updated_at.isnot(None), Lead.created_at.isnot(None)
    ).all()
    times = [
        (r.updated_at - r.created_at).total_seconds() / 86400
        for r in rows if r.updated_at and r.created_at and r.updated_at > r.created_at
    ]
    avg_time = round(sum(times) / len(times), 1) if times else 0.0

    leads_monthly = db.query(func.count(Lead.id)).filter(
        Lead.created_at >= month_start
    ).scalar() or 0

    return {
        "vencidos": vencidos,
        "uncontacted": uncontacted,
        "avg_time_in_funnel": avg_time,
        "leads_monthly": leads_monthly,
        "meta_monthly": META_MONTHLY,
    }


META_LEADS = 200


@router.get("/performance")
def dashboard_performance(
    date: str = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if date:
        ref = datetime.strptime(date, "%Y-%m-%d")
    else:
        ref = datetime.now(timezone.utc).replace(tzinfo=None)

    today_start = ref.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    yesterday_start = today_start - timedelta(days=1)
    month_start = today_start.replace(day=1)
    prev_month_end = month_start
    prev_month_start = (month_start - timedelta(days=1)).replace(day=1)
    day_of_month = today_start.day
    days_in_month = _cal.monthrange(today_start.year, today_start.month)[1]
    now = today_start  # alias para compatibilidade com uso de `now.year/month` abaixo

    def _pct(curr, prev):
        if prev == 0:
            return 100 if curr > 0 else 0
        return round((curr - prev) / prev * 100)

    def _sum(filters):
        return float(
            db.query(func.coalesce(func.sum(Lead.value_potential), 0))
            .filter(Lead.value_potential.isnot(None), *filters)
            .scalar() or 0.0
        )

    def _avg(filters):
        return float(
            db.query(func.coalesce(func.avg(Lead.value_potential), 0))
            .filter(Lead.value_potential.isnot(None), Lead.value_potential > 0, *filters)
            .scalar() or 0.0
        )

    def _cnt(filters):
        return db.query(func.count(Lead.id)).filter(*filters).scalar() or 0

    # Captação
    captacao_hoje = _cnt([Lead.created_at >= today_start, Lead.created_at < today_end])
    captacao_ontem = _cnt([Lead.created_at >= yesterday_start, Lead.created_at < today_start])
    captacao_mes = _cnt([Lead.created_at >= month_start, Lead.created_at < today_end])
    captacao_mes_ant = _cnt([Lead.created_at >= prev_month_start, Lead.created_at < prev_month_end])

    # Valor em Carteira — mês atual até a data de referência, excluindo perdidos
    not_perdido = ~_s_in(_PERDIDO)
    valor_carteira = _sum([not_perdido, Lead.created_at >= month_start, Lead.created_at < today_end])
    valor_carteira_mes_ant = _sum([not_perdido, Lead.created_at >= prev_month_start, Lead.created_at < prev_month_end])

    # Ticket médio — mês atual até a data de referência, excluindo perdidos
    ticket_medio = _avg([not_perdido, Lead.created_at >= month_start, Lead.created_at < today_end])
    ticket_medio_ant = _avg([not_perdido, Lead.created_at >= prev_month_start, Lead.created_at < prev_month_end])

    # Meta de leads — captação do mês vs meta de 200
    meta_pct = round(min(captacao_mes / META_LEADS * 100, 100), 1)

    # Projeção: ritmo diário de captação × dias no mês
    daily_rate = captacao_mes / day_of_month if day_of_month > 0 else 0
    projecao_mes = round(daily_rate * days_in_month)

    # Ranking de operadores — mês atual até a data de referência
    ranking_rows = (
        db.query(
            func.coalesce(Lead.origin, "Sem origem").label("name"),
            func.count(Lead.id).label("count"),
        )
        .filter(Lead.created_at >= month_start, Lead.created_at < today_end)
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .limit(3)
        .all()
    )
    total_ranking = sum(r.count for r in ranking_rows)
    max_count = ranking_rows[0].count if ranking_rows else 1
    ranking = [
        {
            "name": r.name,
            "count": r.count,
            "pct": round(r.count / total_ranking * 100, 1) if total_ranking else 0.0,
            "bar_pct": round(r.count / max_count * 100, 1) if max_count else 0.0,
        }
        for r in ranking_rows
    ]

    # Evolução diária — leads por dia no mês até a data de referência
    daily_rows = (
        db.query(cast(Lead.created_at, Date).label("day"), func.count(Lead.id).label("count"))
        .filter(Lead.created_at >= month_start, Lead.created_at < today_end)
        .group_by(cast(Lead.created_at, Date))
        .order_by(cast(Lead.created_at, Date))
        .all()
    )
    daily_map = {str(r.day): r.count for r in daily_rows}
    evolucao_diaria = [
        {"day": d, "date": f"{now.year}-{now.month:02d}-{d:02d}", "count": daily_map.get(f"{now.year}-{now.month:02d}-{d:02d}", 0)}
        for d in range(1, day_of_month + 1)
    ]

    # Captação do dia por fonte
    hoje_fonte_rows = (
        db.query(
            func.coalesce(Lead.origin, "Sem origem").label("name"),
            func.count(Lead.id).label("count"),
        )
        .filter(Lead.created_at >= today_start, Lead.created_at < today_end)
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .all()
    )
    captacao_hoje_por_fonte = [{"name": r.name, "count": r.count} for r in hoje_fonte_rows]

    return {
        "captacao_hoje": captacao_hoje,
        "vs_ontem": _pct(captacao_hoje, captacao_ontem),
        "captacao_mes": captacao_mes,
        "vs_mes_anterior_captacao": _pct(captacao_mes, captacao_mes_ant),
        "valor_carteira": valor_carteira,
        "vs_carteira": _pct(valor_carteira, valor_carteira_mes_ant),
        "ticket_medio": ticket_medio,
        "vs_ticket": _pct(ticket_medio, ticket_medio_ant),
        "meta_leads": META_LEADS,
        "meta_pct": meta_pct,
        "projecao_mes": projecao_mes,
        "ranking": ranking,
        "evolucao_diaria": evolucao_diaria,
        "captacao_hoje_por_fonte": captacao_hoje_por_fonte,
    }


@router.get("/activity-feed")
def activity_feed(
    limit: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadStatusHistory, Lead.name)
        .join(Lead, Lead.id == LeadStatusHistory.lead_id)
        .order_by(LeadStatusHistory.changed_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(h.id),
            "lead_id": str(h.lead_id),
            "lead_name": name,
            "from_status": h.from_status,
            "to_status": h.to_status,
            "changed_by": h.changed_by,
            "changed_at": h.changed_at.isoformat(),
        }
        for h, name in rows
    ]
