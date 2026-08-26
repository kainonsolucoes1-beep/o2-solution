from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User
from app.security import needs_own_origin_filter
from app.tz_utils import BR_OFFSET, br_date_to_utc_range, now_br

router = APIRouter(prefix="/api/v1/pipeline", tags=["pipeline"])

PENDENTE_STATUSES    = ("pending", "novo", "new")
AGENDADO_STATUSES    = ("scheduled", "qualificado", "qualified")
PROPOSTA_STATUSES    = ("proposal_sent",)
FECHADO_STATUSES     = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
PERDIDO_STATUSES     = ("sale_not_performed",)
HOT_WARM_PERCEPTIONS = ("Quente", "Morno")

BR_FIXED_HOLIDAYS = ((1, 1), (4, 21), (5, 1), (9, 7), (10, 12), (11, 2), (11, 15), (12, 25))
_HOLIDAY_CACHE: dict[int, set] = {}


def _easter(year: int) -> date:
    """Domingo de pascoa (algoritmo de Gauss)."""
    a = year % 19
    b = year // 100
    c = year % 100
    d = b // 4
    e = b % 4
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i = c // 4
    k = c % 4
    l = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * l) // 451
    month = (h + l - 7 * m + 114) // 31
    day = ((h + l - 7 * m + 114) % 31) + 1
    return date(year, month, day)


def _br_holidays(year: int) -> set:
    if year not in _HOLIDAY_CACHE:
        easter = _easter(year)
        movable = [easter - timedelta(days=47), easter - timedelta(days=2), easter + timedelta(days=60)]
        fixed = [date(year, m, d) for m, d in BR_FIXED_HOLIDAYS]
        _HOLIDAY_CACHE[year] = set(fixed + movable)
    return _HOLIDAY_CACHE[year]


def _is_business_day(d: date) -> bool:
    return d.weekday() < 5 and d not in _br_holidays(d.year)


def _business_hours_since(start: Optional[datetime], end: datetime) -> float:
    """Horas corridas decorridas entre start e end, pulando fim de semana e feriado nacional."""
    if not start or end <= start:
        return 0.0
    total = 0.0
    cur = start
    while cur.date() < end.date():
        next_day = datetime.combine(cur.date() + timedelta(days=1), datetime.min.time())
        if _is_business_day(cur.date()):
            total += (next_day - cur).total_seconds() / 3600
        cur = next_day
    if _is_business_day(cur.date()):
        total += (end - cur).total_seconds() / 3600
    return total


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _business_minutes(start: datetime, end: datetime) -> float:
    """Minutos úteis entre dois datetimes (seg-sex 08h-18h)."""
    WORK_START, WORK_END = 8, 18
    if not start or not end or end <= start:
        return 0.0
    total = 0.0
    cur = start.replace(tzinfo=None)
    end = end.replace(tzinfo=None)
    while cur < end:
        if cur.weekday() >= 5:
            days = 7 - cur.weekday()
            cur = (cur + timedelta(days=days)).replace(hour=WORK_START, minute=0, second=0, microsecond=0)
            continue
        day_start = cur.replace(hour=WORK_START, minute=0, second=0, microsecond=0)
        day_end   = cur.replace(hour=WORK_END,   minute=0, second=0, microsecond=0)
        if cur < day_start:
            cur = day_start
            continue
        if cur >= day_end:
            cur = day_start + timedelta(days=1)
            continue
        segment_end = min(end, day_end)
        total += (segment_end - cur).total_seconds() / 60
        cur = day_start + timedelta(days=1)
    return total


def _status_in(statuses):
    return or_(*[func.lower(Lead.status) == s.lower() for s in statuses])


def _is_admin(user: User) -> bool:
    return user.role == "admin"


# "Captacao efetiva": quando um lead cancelado/parado e' retrabalhado
# (Lead.retrabalhado_em preenchido), ele passa a contar na data do retrabalho
# pros relatorios de periodo — sem apagar Lead.created_at (historico real).
EFFECTIVE_CAPTACAO = func.coalesce(Lead.retrabalhado_em, Lead.created_at)


def _effective_source(source: Optional[str], current_user: User) -> Optional[str]:
    """Usuario nao-admin so' pode ver a propria origem (Lead.origin == nome
    dele), independente do que for pedido no parametro 'source' — mesmo
    padrao ja usado em leads_routes.py. Comercial nao entra nessa restricao
    -- a visibilidade dele ja vem do filtro global de equipe
    (restrict_to_usuario_leads)."""
    if not needs_own_origin_filter(current_user):
        return source
    return current_user.first_name or current_user.username


def _apply_filters(q, date_from: Optional[str], date_to: Optional[str], source: Optional[str], team: Optional[str] = None):
    if date_from:
        try:
            dt_from, _ = br_date_to_utc_range(date_from)
            q = q.filter(EFFECTIVE_CAPTACAO >= dt_from)
        except ValueError:
            pass
    if date_to:
        try:
            _, dt_to_excl = br_date_to_utc_range(date_to)
            q = q.filter(EFFECTIVE_CAPTACAO < dt_to_excl)
        except ValueError:
            pass
    if source:
        parts = [s.strip() for s in source.split(',') if s.strip()]
        if len(parts) == 1:
            q = q.filter(Lead.origin == parts[0])
        else:
            q = q.filter(Lead.origin.in_(parts))
    if team:
        parts = [s.strip() for s in team.split(',') if s.strip()]
        if len(parts) == 1:
            q = q.filter(Lead.team == parts[0])
        elif parts:
            q = q.filter(Lead.team.in_(parts))
    return q


def _count_status(db: Session, statuses, date_from=None, date_to=None, source=None, team=None, extra_filters=()) -> int:
    q = db.query(func.count(Lead.id)).filter(_status_in(statuses), *extra_filters)
    return _apply_filters(q, date_from, date_to, source, team).scalar() or 0


def _count_perception(db: Session, perceptions, date_from=None, date_to=None, source=None, team=None) -> int:
    q = db.query(func.count(Lead.id)).filter(Lead.perception.in_(list(perceptions)))
    return _apply_filters(q, date_from, date_to, source, team).scalar() or 0


def _sum_value(db: Session, extra_filters, date_from=None, date_to=None, source=None, team=None) -> float:
    q = db.query(func.coalesce(func.sum(Lead.value_potential), 0)).filter(*extra_filters)
    return float(_apply_filters(q, date_from, date_to, source, team).scalar() or 0.0)


@router.get("/overview")
def pipeline_overview(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = _effective_source(source, current_user)
    # lead quente/morno ainda nao fechado/perdido conta so em "Qualificado" (negociacao),
    # mesmo que o status dele ainda seja pendente/agendado/proposta
    not_hot_warm = ~Lead.perception.in_(list(HOT_WARM_PERCEPTIONS))

    neg_q = db.query(func.count(Lead.id)).filter(
        Lead.perception.in_(list(HOT_WARM_PERCEPTIONS)),
        ~_status_in(FECHADO_STATUSES),
        ~_status_in(PERDIDO_STATUSES),
    )
    negociacao = _apply_filters(neg_q, date_from, date_to, source, team).scalar() or 0

    neg_val_q = db.query(func.coalesce(func.sum(Lead.value_potential), 0)).filter(
        Lead.perception.in_(list(HOT_WARM_PERCEPTIONS)),
        ~_status_in(FECHADO_STATUSES),
        ~_status_in(PERDIDO_STATUSES),
    )
    negociacao_value = float(_apply_filters(neg_val_q, date_from, date_to, source, team).scalar() or 0.0)

    return {
        "novo":        _count_status(db, PENDENTE_STATUSES,  date_from, date_to, source, team, extra_filters=[not_hot_warm]),
        "qualificado": _count_status(db, AGENDADO_STATUSES,  date_from, date_to, source, team, extra_filters=[not_hot_warm]),
        "proposta":    _count_status(db, PROPOSTA_STATUSES,  date_from, date_to, source, team, extra_filters=[not_hot_warm]),
        "negociacao":  negociacao,
        "fechado":     _count_status(db, FECHADO_STATUSES,   date_from, date_to, source, team),
        "perdido":     _count_status(db, PERDIDO_STATUSES,   date_from, date_to, source, team),
        "novo_value":        _sum_value(db, [_status_in(PENDENTE_STATUSES), not_hot_warm],  date_from, date_to, source, team),
        "qualificado_value": _sum_value(db, [_status_in(AGENDADO_STATUSES), not_hot_warm],  date_from, date_to, source, team),
        "proposta_value":    _sum_value(db, [_status_in(PROPOSTA_STATUSES), not_hot_warm],  date_from, date_to, source, team),
        "negociacao_value":  negociacao_value,
        "fechado_value":     _sum_value(db, [_status_in(FECHADO_STATUSES)],   date_from, date_to, source, team),
        "perdido_value":     _sum_value(db, [_status_in(PERDIDO_STATUSES)],   date_from, date_to, source, team),
    }


@router.get("/funnel")
def pipeline_funnel(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = _effective_source(source, current_user)
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
    team: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    source = _effective_source(source, current_user)
    now = _now()

    vencidos_filter = _status_in(PENDENTE_STATUSES)

    # "vencido" = 24h uteis sem atualizacao (fim de semana e feriado nacional nao contam)
    candidatos_q = db.query(Lead).filter(Lead.updated_at.isnot(None), vencidos_filter)
    candidatos_q = _apply_filters(candidatos_q, date_from, date_to, source, team)
    vencidos_all = [c for c in candidatos_q.all() if _business_hours_since(c.updated_at, now) >= 24]
    vencidos_all.sort(key=lambda c: c.updated_at)

    vencidos_count = len(vencidos_all)
    uncontacted_count = vencidos_count

    vencidos_rows = vencidos_all[:10]
    uncontacted_rows = vencidos_rows

    terminal_rows = _apply_filters(
        db.query(Lead.created_at, Lead.updated_at).filter(
            _status_in(FECHADO_STATUSES + PERDIDO_STATUSES),
            Lead.created_at.isnot(None),
            Lead.updated_at.isnot(None),
        ),
        date_from, date_to, source, team,
    ).all()
    times = [
        (r.updated_at - r.created_at).total_seconds() / 86400
        for r in terminal_rows
        if r.updated_at > r.created_at
    ]
    avg_time_in_funnel = round(sum(times) / len(times), 1) if times else 0.0

    # Desempenho no atendimento: tempo médio que o lead ficou em "novo" antes de avançar
    avg_first_contact_minutes = 0.0
    contacted_count = 0
    try:
        from sqlalchemy import bindparam
        from sqlalchemy import text as sa_text
        date_from_dt = br_date_to_utc_range(date_from)[0] if date_from else None
        date_to_dt   = br_date_to_utc_range(date_to)[1] if date_to else None
        team_parts = [s.strip() for s in team.split(',') if s.strip()] if team else None
        team_clause = "AND l.team IN :team_parts" if team_parts else ""
        stmt = sa_text(f"""
            SELECT l.created_at, ne.first_exit
            FROM leads l
            JOIN (
                SELECT lead_id, MIN(changed_at) AS first_exit
                FROM lead_status_history
                WHERE LOWER(from_status) IN ('novo','new','pending')
                GROUP BY lead_id
            ) ne ON l.id = ne.lead_id
            WHERE ne.first_exit > l.created_at
              AND (:date_from IS NULL OR COALESCE(l.retrabalhado_em, l.created_at) >= :date_from)
              AND (:date_to   IS NULL OR COALESCE(l.retrabalhado_em, l.created_at) <  :date_to)
              AND (:source    IS NULL OR l.origin = :source)
              {team_clause}
        """)
        params = {"date_from": date_from_dt, "date_to": date_to_dt, "source": source or None}
        if team_parts:
            stmt = stmt.bindparams(bindparam("team_parts", expanding=True))
            params["team_parts"] = team_parts
        perf_rows = db.execute(stmt, params).fetchall()
        biz_mins = [_business_minutes(r[0], r[1]) for r in perf_rows if r[0] and r[1]]
        avg_first_contact_minutes = round(sum(biz_mins) / len(biz_mins), 1) if biz_mins else 0.0
        contacted_count = len(biz_mins)
    except Exception as _perf_err:
        import traceback; traceback.print_exc()

    pf_count = _apply_filters(
        db.query(func.count(Lead.id)).filter(Lead.modalidade == "PF"),
        date_from, date_to, source, team,
    ).scalar() or 0
    pme_count = _apply_filters(
        db.query(func.count(Lead.id)).filter(Lead.modalidade == "PME"),
        date_from, date_to, source, team,
    ).scalar() or 0

    return {
        "pf_count": pf_count,
        "pme_count": pme_count,
        "vencidos_count": vencidos_count,
        "uncontacted_count": uncontacted_count,
        "avg_time_in_funnel": avg_time_in_funnel,
        "avg_first_contact_minutes": avg_first_contact_minutes,
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
    source = _effective_source(source, current_user)
    now = _now()
    today_start, _ = br_date_to_utc_range(now_br().date())
    cutoff_5d = now - timedelta(days=5)

    ct_q = db.query(func.count(Lead.id)).filter(_status_in(PENDENTE_STATUSES), EFFECTIVE_CAPTACAO >= today_start)
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
    source = _effective_source(source, current_user)
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
    source = _effective_source(source, current_user)
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
    source_name = _effective_source(source_name, current_user)
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
