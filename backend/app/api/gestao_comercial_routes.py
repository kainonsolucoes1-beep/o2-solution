from calendar import monthrange
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadStatusHistory, LeadNote, LeadSchedule
from app.models.user import User
from app.models.sdr_meta import SdrMeta
from app.security import can_see_financials, needs_own_origin_filter
from app.tz_utils import BR_OFFSET, br_date_to_utc_range, br_month_utc_range, now_br

router = APIRouter(prefix="/api/v1/gestao-comercial", tags=["gestao-comercial"])

# abreviacao de mes em pt-BR — nao depende de locale instalado no servidor
MESES_ABREV = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

VENDA_STATUSES      = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
HOT_WARM_PERCEPTIONS = ("Quente", "Morno")
CANCELADO_STATUS    = "sale_not_performed"
AGENDAMENTO_STATUSES = ("qualificado", "scheduled")
PROPOSTA_STATUSES   = ("proposta", "proposal_sent", "negociacao")

# "Captacao efetiva": quando um lead cancelado/parado e' retrabalhado
# (Lead.retrabalhado_em preenchido), ele passa a contar na data do retrabalho
# pros relatorios de periodo — sem apagar Lead.created_at (historico real).
EFFECTIVE_CAPTACAO = func.coalesce(Lead.retrabalhado_em, Lead.created_at)

# mesma classificação SDR x Orgânico usada no front (GestaoComercial.tsx: groupOrigens)
O2_NAMES        = {"clara", "maria eduarda", "kauany", "gabrieli", "o2 solution", "o2solution"}
ORGANICO_EXTRA  = {"site", "chatgpt.com", "chatgpt", "google", "instagram", "facebook", "whatsapp"}


def _is_organico(origin: str) -> bool:
    lower = origin.lower()
    return "org" in lower or lower in ORGANICO_EXTRA


def _ranking_bucket(origin: str) -> str | None:
    o = (origin or "").strip()
    if not o or _is_organico(o):
        return None
    return "o2 Solution" if o.lower() in O2_NAMES else o


def _parse_month(month: str | None):
    if month:
        try:
            return int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            pass
    nb = now_br()
    return nb.year, nb.month


def _month_range(year: int, mon: int, until_day: int | None = None):
    dt_from, dt_to_excl = br_month_utc_range(year, mon)
    if until_day:
        # clampa pro ultimo dia real do mes -- until_day costuma vir do
        # "mesmo dia do mes corrente" (ex: comparar julho, 31 dias, contra
        # o mes anterior), e nem todo mes tem dia 31/30/29
        last_day = monthrange(year, mon)[1]
        until_start, _ = br_date_to_utc_range(f"{year:04d}-{mon:02d}-{min(until_day, last_day):02d}")
        dt_to_excl = min(dt_to_excl, until_start + timedelta(days=1))
    return dt_from, dt_to_excl - timedelta(microseconds=1)


def _resolve_range(month: str | None, until_day: int | None, start: str | None, end: str | None):
    if start and end:
        dt_from, _ = br_date_to_utc_range(start)
        _, dt_to_excl = br_date_to_utc_range(end)
        return dt_from, dt_to_excl - timedelta(microseconds=1)
    year, mon = _parse_month(month)
    return _month_range(year, mon, until_day)


def _team_clause(team: str | None):
    if not team:
        return []
    parts = [s.strip() for s in team.split(",") if s.strip()]
    if not parts:
        return []
    return [Lead.team.in_(parts)] if len(parts) > 1 else [Lead.team == parts[0]]


def _is_admin(user: User) -> bool:
    return user.role == "admin"


def _scope_clause(team: str | None, current_user: User):
    """Filtro de time (se informado) + visibilidade por usuario: mesmo padrao
    de leads_routes.py — usuario nao-admin so' enxerga os proprios leads
    (Lead.origin == nome dele), independente de qualquer filtro de
    time/periodo informado na tela."""
    clause = _team_clause(team)
    if needs_own_origin_filter(current_user):
        my_name = current_user.first_name or current_user.username
        # inclui os leads de renutrição atribuídos a ele (origem é a original)
        clause = [*clause, or_(Lead.origin == my_name, Lead.renutricao_owner_id == current_user.id)]
    return clause


@router.get("/visao-geral")
def visao_geral(
    month: str = Query(None),
    until_day: int = Query(None),
    start: str = Query(None),
    end: str = Query(None),
    team: str = Query(None),
    vendas_por_fechamento: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dt_from, dt_to = _resolve_range(month, until_day, start, end)
    team_clause = _scope_clause(team, current_user)

    leads = db.query(Lead.status, Lead.value_potential, Lead.perception).filter(
        EFFECTIVE_CAPTACAO >= dt_from, EFFECTIVE_CAPTACAO <= dt_to, *team_clause,
    ).all()

    venda_set = {s.lower() for s in VENDA_STATUSES}
    proposta_set = {s.lower() for s in PROPOSTA_STATUSES}
    captacoes = len(leads)
    qualificados = sum(1 for _, _, p in leads if p in HOT_WARM_PERCEPTIONS)
    em_negociacao = sum(1 for s, _, _ in leads if (s or "").lower() in proposta_set)

    if vendas_por_fechamento:
        # conta vendas pela data em que o status virou venda, nao pela data de captacao
        # (ciclo de fechamento longo faz vendas de leads captados fora do periodo)
        rows = (
            db.query(LeadStatusHistory.lead_id)
            .join(Lead, Lead.id == LeadStatusHistory.lead_id)
            .filter(
                LeadStatusHistory.changed_at >= dt_from,
                LeadStatusHistory.changed_at <= dt_to,
                func.lower(LeadStatusHistory.to_status).in_(venda_set),
                *team_clause,
            )
            .all()
        )
        vendas = len({lead_id for (lead_id,) in rows})
    else:
        vendas = sum(1 for s, _, _ in leads if (s or "").lower() in venda_set)

    leads_com_valor = [float(v) for s, v, _ in leads if (s or "").lower() != CANCELADO_STATUS and v]
    receita_potencial = sum(leads_com_valor)
    perda_financeira = sum(float(v or 0) for s, v, _ in leads if (s or "").lower() == CANCELADO_STATUS)
    # Ticket medio = receita potencial de tudo que esta em esteira (nao cancelado) / total de captacoes
    ticket_medio = (receita_potencial / captacoes) if captacoes > 0 else 0.0
    conversao = round(vendas / captacoes * 100, 1) if captacoes > 0 else 0.0

    return {
        "captacoes": captacoes,
        "vendas": vendas,
        "conversao": conversao,
        "qualificados": qualificados,
        "em_negociacao": em_negociacao,
        "receita_potencial": receita_potencial,
        "perda_financeira": perda_financeira,
        "ticket_medio": ticket_medio,
    }


@router.get("/evolucao-diaria")
def evolucao_diaria(
    month: str = Query(None),
    until_day: int = Query(None),
    start: str = Query(None),
    end: str = Query(None),
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dt_from, dt_to = _resolve_range(month, until_day, start, end)

    rows = db.query(
        func.date(EFFECTIVE_CAPTACAO - BR_OFFSET).label("day"),
        Lead.status,
    ).filter(EFFECTIVE_CAPTACAO >= dt_from, EFFECTIVE_CAPTACAO <= dt_to, *_scope_clause(team, current_user)).all()

    venda_set = {s.lower() for s in VENDA_STATUSES}
    daily: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0})
    for day, status in rows:
        key = str(day)
        daily[key]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            daily[key]["vendas"] += 1

    result = []
    cur = dt_from.date()
    last = (dt_to - BR_OFFSET).date()
    while cur <= last:
        key = cur.isoformat()
        result.append({
            "dia": cur.day,
            "data": cur.strftime("%d/%m"),
            "captacoes": daily[key]["captacoes"],
            "vendas": daily[key]["vendas"],
        })
        cur += timedelta(days=1)
    return result


@router.get("/origens-captacao")
def origens_captacao(
    month: str = Query(None),
    until_day: int = Query(None),
    start: str = Query(None),
    end: str = Query(None),
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dt_from, dt_to = _resolve_range(month, until_day, start, end)

    rows = (
        db.query(Lead.origin, func.count(Lead.id).label("captacoes"))
        .filter(
            EFFECTIVE_CAPTACAO >= dt_from, EFFECTIVE_CAPTACAO <= dt_to,
            Lead.origin.isnot(None), Lead.origin != "",
            *_scope_clause(team, current_user),
        )
        .group_by(Lead.origin)
        .order_by(func.count(Lead.id).desc())
        .all()
    )

    total = sum(r.captacoes for r in rows)
    return [
        {
            "origem": r.origin,
            "captacoes": r.captacoes,
            "pct": round(r.captacoes / total * 100, 1) if total > 0 else 0.0,
        }
        for r in rows
    ]


@router.get("/modalidades-captacao")
def modalidades_captacao(
    month: str = Query(None),
    start: str = Query(None),
    end: str = Query(None),
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    dt_from, dt_to = _resolve_range(month, None, start, end)

    leads = (
        db.query(Lead.modalidade, Lead.status)
        .filter(
            EFFECTIVE_CAPTACAO >= dt_from, EFFECTIVE_CAPTACAO <= dt_to,
            Lead.modalidade.isnot(None), Lead.modalidade != "",
            *_scope_clause(team, current_user),
        )
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    data: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0})
    for modalidade, status in leads:
        if modalidade == "Empresarial":
            modalidade = "PME"
        data[modalidade]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            data[modalidade]["vendas"] += 1

    total = sum(c["captacoes"] for c in data.values())
    result = [
        {
            "modalidade": modalidade,
            "captacoes": counts["captacoes"],
            "vendas": counts["vendas"],
            "conversao": round(counts["vendas"] / counts["captacoes"] * 100, 1) if counts["captacoes"] > 0 else 0.0,
            "pct": round(counts["captacoes"] / total * 100, 1) if total > 0 else 0.0,
        }
        for modalidade, counts in data.items()
    ]
    result.sort(key=lambda x: x["captacoes"], reverse=True)
    return result


@router.get("/comparativo-mensal")
def comparativo_mensal(
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = now_br()
    result = []
    team_clause = _scope_clause(team, current_user)

    for i in range(5, -1, -1):
        mon = now.month - i
        year = now.year
        while mon <= 0:
            mon += 12
            year -= 1

        dt_from, dt_to = _month_range(year, mon)
        leads = db.query(Lead.status, Lead.value_potential).filter(
            EFFECTIVE_CAPTACAO >= dt_from, EFFECTIVE_CAPTACAO <= dt_to, *team_clause,
        ).all()

        venda_set = {s.lower() for s in VENDA_STATUSES}
        captacoes = len(leads)
        vendas = sum(1 for s, _ in leads if (s or "").lower() in venda_set)
        receita = sum(float(v or 0) for s, v in leads if (s or "").lower() in venda_set)

        result.append({
            "mes": f"{year}-{mon:02d}",
            "mes_label": f"{MESES_ABREV[mon]}/{str(year)[2:]}",
            "captacoes": captacoes,
            "vendas": vendas,
            "receita": receita,
        })

    return result


@router.get("/receita-potencial-drill")
def receita_potencial_drill(
    month: str = Query(None),
    tipo: str = Query("receita"),   # receita | vendas | perda
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    base = [
        EFFECTIVE_CAPTACAO >= dt_from,
        EFFECTIVE_CAPTACAO <= dt_to,
        Lead.value_potential.isnot(None),
        Lead.value_potential > 0,
        *_scope_clause(team, current_user),
    ]

    if tipo == "vendas":
        base.append(Lead.status.in_(VENDA_STATUSES))
        label_col = Lead.status
    elif tipo == "perda":
        base.append(Lead.status == CANCELADO_STATUS)
        label_col = func.coalesce(Lead.lost_reason, "Não informado")
    else:
        base.append(Lead.status != CANCELADO_STATUS)
        label_col = Lead.status

    rows = (
        db.query(
            Lead.origin,
            label_col.label("status"),
            func.coalesce(func.sum(Lead.value_potential), 0).label("total_value"),
            func.count(Lead.id).label("count"),
        )
        .filter(*base)
        .group_by(Lead.origin, label_col)
        .all()
    )

    return [
        {
            "origem": r.origin or "Sem origem",
            "status": r.status or "desconhecido",
            "total_value": float(r.total_value),
            "count": r.count,
        }
        for r in rows
    ]


@router.get("/receita-contratos")
def receita_contratos(
    month: str = Query(None),
    status: str = Query(None),
    origens: str = Query(None),
    tipo: str = Query("receita"),   # receita | vendas | perda
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    filters = [
        EFFECTIVE_CAPTACAO >= dt_from,
        EFFECTIVE_CAPTACAO <= dt_to,
        Lead.value_potential.isnot(None),
        Lead.value_potential > 0,
        *_scope_clause(team, current_user),
    ]

    def _status_eq(s: str):
        parts = [p.strip() for p in s.split(",") if p.strip()]
        return Lead.status == parts[0] if len(parts) == 1 else Lead.status.in_(parts)

    if tipo == "vendas":
        filters.append(Lead.status.in_(VENDA_STATUSES))
        if status:
            filters.append(_status_eq(status))
    elif tipo == "perda":
        filters.append(Lead.status == CANCELADO_STATUS)
        if status:
            if status == "Não informado":
                filters.append(Lead.lost_reason.is_(None))
            else:
                filters.append(Lead.lost_reason == status)
    else:
        filters.append(Lead.status != CANCELADO_STATUS)
        if status:
            filters.append(_status_eq(status))

    if origens:
        parts = [s.strip() for s in origens.split(',') if s.strip()]
        if len(parts) == 1:
            filters.append(Lead.origin == parts[0])
        elif parts:
            filters.append(Lead.origin.in_(parts))

    leads = (
        db.query(Lead.name, Lead.origin, Lead.status, Lead.value_potential, Lead.lost_reason)
        .filter(*filters)
        .order_by(Lead.value_potential.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "nome": l.name or "Sem nome",
            "origem": l.origin or "Sem origem",
            "status": l.status,
            "valor": float(l.value_potential),
            "motivo": l.lost_reason,
        }
        for l in leads
    ]


@router.get("/performance-operadores")
def performance_operadores(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    filters = [
        EFFECTIVE_CAPTACAO >= dt_from,
        EFFECTIVE_CAPTACAO <= dt_to,
        Lead.origin.isnot(None),
        Lead.origin != "",
    ]
    if needs_own_origin_filter(current_user):
        my_name = current_user.first_name or current_user.username
        filters.append(or_(Lead.origin == my_name, Lead.renutricao_owner_id == current_user.id))

    leads = (
        db.query(Lead.origin, Lead.status, Lead.value_potential)
        .filter(*filters)
        .all()
    )

    venda_set    = {s.lower() for s in VENDA_STATUSES}
    agenda_set   = {s.lower() for s in AGENDAMENTO_STATUSES}
    proposta_set = {s.lower() for s in PROPOSTA_STATUSES}

    data: dict = defaultdict(lambda: {"captacoes": 0, "agendamentos": 0, "propostas": 0, "vendas": 0, "cancelados": 0, "receita": 0.0})
    for origin, status, value in leads:
        op = (origin or "").strip()
        if not op:
            continue
        s = (status or "").lower()
        data[op]["captacoes"] += 1
        if s in venda_set:
            data[op]["vendas"] += 1
            data[op]["receita"] += float(value or 0)
        elif s == CANCELADO_STATUS:
            data[op]["cancelados"] += 1
        elif s in proposta_set:
            data[op]["propostas"] += 1
        elif s in agenda_set:
            data[op]["agendamentos"] += 1

    result = []
    for op, counts in data.items():
        cap = counts["captacoes"]
        ven = counts["vendas"]
        result.append({
            "operador": op,
            "captacoes": cap,
            "agendamentos": counts["agendamentos"],
            "propostas": counts["propostas"],
            "vendas": ven,
            "cancelados": counts["cancelados"],
            "receita": counts["receita"],
            "conversao": round(ven / cap * 100, 1) if cap > 0 else 0.0,
        })

    result.sort(key=lambda x: (x["vendas"], x["captacoes"]), reverse=True)
    for i, r in enumerate(result):
        r["ranking"] = i + 1

    return result


@router.get("/performance-historico")
def performance_historico(
    origens: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Historico por operador (vitalicio ou recortado por date_from/date_to) + tendencia mensal."""
    filters = [Lead.origin.isnot(None), Lead.origin != "", *_scope_clause(team, current_user)]
    if origens:
        parts = [s.strip() for s in origens.split(",") if s.strip()]
        if len(parts) == 1:
            filters.append(Lead.origin == parts[0])
        elif parts:
            filters.append(Lead.origin.in_(parts))
    if date_from:
        dt_from, _ = br_date_to_utc_range(date_from)
        filters.append(EFFECTIVE_CAPTACAO >= dt_from)
    if date_to:
        _, dt_to_excl = br_date_to_utc_range(date_to)
        filters.append(EFFECTIVE_CAPTACAO <= dt_to_excl - timedelta(microseconds=1))

    leads = (
        db.query(Lead.origin, Lead.status, Lead.value_potential, EFFECTIVE_CAPTACAO)
        .filter(*filters)
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}

    data: dict = defaultdict(lambda: {"captacoes": 0, "cancelados": 0, "vendas": 0, "receita": 0.0})
    for origin, status, value, _ in leads:
        op = (origin or "").strip()
        if not op:
            continue
        s = (status or "").lower()
        data[op]["captacoes"] += 1
        if s in venda_set:
            data[op]["vendas"] += 1
            data[op]["receita"] += float(value or 0)
        elif s == CANCELADO_STATUS:
            data[op]["cancelados"] += 1

    operadores = []
    for op, counts in data.items():
        cap = counts["captacoes"]
        ven = counts["vendas"]
        operadores.append({
            "operador": op,
            "tipo": "canal" if _is_organico(op) else "operador",
            "captacoes": cap,
            "cancelados": counts["cancelados"],
            "vendas": ven,
            "receita": counts["receita"],
            "conversao": round(ven / cap * 100, 1) if cap > 0 else 0.0,
            "cancel_rate": round(counts["cancelados"] / cap * 100, 1) if cap > 0 else 0.0,
            "ticket_medio": round(counts["receita"] / ven, 2) if ven > 0 else 0.0,
        })
    operadores.sort(key=lambda x: x["receita"], reverse=True)

    if not leads:
        return {"operadores": operadores, "trend": [], "trend_por_operador": {}}

    monthly: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "receita": 0.0})
    monthly_por_operador: dict = defaultdict(lambda: defaultdict(lambda: {"captacoes": 0, "vendas": 0, "receita": 0.0}))
    for origin, status, value, created_at in leads:
        op = (origin or "").strip()
        if not op:
            continue
        key = f"{created_at.year}-{created_at.month:02d}"
        s = (status or "").lower()
        monthly[key]["captacoes"] += 1
        m_op = monthly_por_operador[op][key]
        m_op["captacoes"] += 1
        if s in venda_set:
            monthly[key]["vendas"] += 1
            monthly[key]["receita"] += float(value or 0)
            m_op["vendas"] += 1
            m_op["receita"] += float(value or 0)

    earliest = min(l.created_at for l in leads)
    latest = max(l.created_at for l in leads)
    meses_ordenados = []
    year, mon = earliest.year, earliest.month
    while (year, mon) <= (latest.year, latest.month):
        meses_ordenados.append((year, mon))
        mon += 1
        if mon > 12:
            mon = 1
            year += 1

    trend = []
    for year, mon in meses_ordenados:
        key = f"{year}-{mon:02d}"
        m = monthly.get(key, {"captacoes": 0, "vendas": 0, "receita": 0.0})
        trend.append({
            "mes": key,
            "mes_label": f"{MESES_ABREV[mon]}/{str(year)[2:]}",
            "captacoes": m["captacoes"],
            "vendas": m["vendas"],
            "receita": m["receita"],
        })

    # tendencia mensal so para quem e "operador" (canais ficam de fora do grafico comparativo)
    trend_por_operador = {}
    for op, counts in data.items():
        if _is_organico(op):
            continue
        por_mes = monthly_por_operador.get(op, {})
        trend_por_operador[op] = [
            {
                "mes": f"{year}-{mon:02d}",
                "mes_label": f"{MESES_ABREV[mon]}/{str(year)[2:]}",
                "captacoes": por_mes.get(f"{year}-{mon:02d}", {}).get("captacoes", 0),
                "vendas": por_mes.get(f"{year}-{mon:02d}", {}).get("vendas", 0),
                "receita": por_mes.get(f"{year}-{mon:02d}", {}).get("receita", 0.0),
            }
            for year, mon in meses_ordenados
        ]

    return {"operadores": operadores, "trend": trend, "trend_por_operador": trend_por_operador}


@router.get("/conversion-points")
def conversion_points_by_group(
    month: str = Query(None),
    origens: str = Query(None),
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    filters = [
        EFFECTIVE_CAPTACAO >= dt_from,
        EFFECTIVE_CAPTACAO <= dt_to,
        Lead.conversion_point.isnot(None),
        Lead.conversion_point != "",
        *_scope_clause(team, current_user),
    ]
    if origens:
        parts = [s.strip() for s in origens.split(',') if s.strip()]
        if parts:
            filters.append(Lead.origin.in_(parts))

    rows = (
        db.query(Lead.conversion_point, func.count(Lead.id).label("cnt"))
        .filter(*filters)
        .group_by(Lead.conversion_point)
        .order_by(func.count(Lead.id).desc())
        .all()
    )
    total = sum(r.cnt for r in rows)
    return [
        {
            "conversion_point": r.conversion_point,
            "count": r.cnt,
            "pct": round(r.cnt / total * 100, 1) if total else 0.0,
        }
        for r in rows
    ]


def _compute_meta_mes(db: Session, parts: list[str]):
    """Meta do mes corrente pro agente, independente do filtro de periodo da
    tela (Metas do Mes sempre olha pro mes calendario atual). Casa o nome do
    agente (qualquer um dos `parts`) contra sdr_metas.nome, sem diferenciar
    maiusculas/minusculas."""
    meta_row = None
    for p in parts:
        meta_row = db.query(SdrMeta).filter(func.lower(SdrMeta.nome) == p.strip().lower()).first()
        if meta_row:
            break
    if not meta_row:
        return None

    nb = now_br()
    mes_inicio, mes_fim = br_month_utc_range(nb.year, nb.month)

    mes_leads = (
        db.query(Lead.status, Lead.value_potential)
        .filter(Lead.origin.in_(parts), EFFECTIVE_CAPTACAO >= mes_inicio, EFFECTIVE_CAPTACAO < mes_fim)
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    if meta_row.tipo == "clt":
        progresso = sum(float(v or 0) for s, v in mes_leads if (s or "").lower() in venda_set)
    else:
        progresso = float(len(mes_leads))

    return {
        "tipo": meta_row.tipo,
        "meta_valor": float(meta_row.meta_valor),
        "progresso": progresso,
        "mes_label": f"{MESES_ABREV[nb.month]}/{str(nb.year)[2:]}",
    }


@router.get("/vida-sdr")
def vida_sdr(
    origens: str = Query(...),
    date_from: str = Query(None),
    date_to: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Historico de um SDR/origem: funil, conversao e receita real, vitalicio por padrao
    ou recortado por date_from/date_to (filtro Geral / Mes atual / Entre datas no frontend)."""
    if needs_own_origin_filter(current_user):
        # usuario nao-admin so' pode ver o proprio historico, independente do
        # que vier em `origens` (ex: alguem digitando outro nome na URL)
        origens = current_user.first_name or current_user.username
    parts = [s.strip() for s in origens.split(",") if s.strip()]

    date_filters = []
    if date_from:
        _dt_from, _ = br_date_to_utc_range(date_from)
        date_filters.append(EFFECTIVE_CAPTACAO >= _dt_from)
    if date_to:
        _, _dt_to_excl = br_date_to_utc_range(date_to)
        date_filters.append(EFFECTIVE_CAPTACAO <= _dt_to_excl - timedelta(microseconds=1))

    # Quem trabalha só renutrição (ex: Pamela) nunca captura um lead com o
    # proprio nome como origem -- inclui tambem os leads que essa pessoa
    # possui via renutricao_owner_id, senao a "Vida do Agente" dela vem vazia.
    matched_users = (
        db.query(User).filter(or_(User.first_name.in_(parts), User.username.in_(parts))).all()
        if parts else []
    )
    owner_ids = [u.id for u in matched_users]
    origin_or_owner = Lead.origin.in_(parts) if parts else None
    if owner_ids:
        origin_or_owner = or_(origin_or_owner, Lead.renutricao_owner_id.in_(owner_ids))
    filters = [origin_or_owner, *date_filters] if parts else []

    # tenure do agente ("Desde X - N meses ativo") independe do filtro de
    # periodo selecionado na tela, por isso e' calculado sem os date_filters.
    # Prioriza a data de contratacao (hire_date) e, na falta dela, a data de
    # criacao da conta -- em vez do lead mais antigo com essa origem: um lead
    # antigo reatribuido a esse agente preserva o created_at original
    # (historico real) e faria parecer que ele esta' no sistema desde muito
    # antes do que realmente esta'.
    user_match = matched_users[0] if matched_users else None
    lead_min_created = db.query(func.min(Lead.created_at)).filter(Lead.origin.in_(parts)).scalar() if parts else None
    if user_match and user_match.hire_date:
        ativo_desde = datetime.combine(user_match.hire_date, datetime.min.time())
    elif user_match and user_match.created_at:
        ativo_desde = user_match.created_at
    else:
        ativo_desde = lead_min_created
    meta = _compute_meta_mes(db, parts) if parts else None

    leads = (
        db.query(Lead.status, Lead.receita_real_recebida, Lead.receita_real_a_receber, EFFECTIVE_CAPTACAO.label("created_at"), Lead.value_potential)
        .filter(*filters)
        .all()
    ) if parts else []

    if not leads:
        return {
            "captacoes": 0, "em_andamento": 0, "cancelados": 0, "vendas": 0,
            "conversao": 0.0, "receita_recebida": 0.0, "receita_a_receber": 0.0, "receita_potencial": 0.0,
            "primeiro_lead_em": None, "ativo_desde": ativo_desde.isoformat() if ativo_desde else None, "meta": meta, "trend": [],
            "ranking": None, "ranking_geral": None, "atividades": [],
        }

    venda_set = {s.lower() for s in VENDA_STATUSES}
    captacoes = len(leads)
    vendas = 0
    cancelados = 0
    receita_recebida = 0.0
    receita_a_receber = 0.0
    receita_potencial = 0.0
    monthly: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "receita": 0.0})

    for status, recebido, a_receber, captacao_em, value_potential in leads:
        s = (status or "").lower()
        if s in venda_set:
            vendas += 1
        elif s == CANCELADO_STATUS:
            cancelados += 1
        else:
            # em aberto no funil (inclui "novo") — soma o valor estimado de cada lead,
            # o mesmo que aparece na Ficha do Lead como Valor Cotação/Proposta
            receita_potencial += float(value_potential or 0)
        receita_recebida += float(recebido or 0)
        receita_a_receber += float(a_receber or 0)

        key = f"{captacao_em.year}-{captacao_em.month:02d}"
        monthly[key]["captacoes"] += 1
        if s in venda_set:
            monthly[key]["vendas"] += 1
        monthly[key]["receita"] += float(recebido or 0)

    em_andamento = captacoes - vendas - cancelados
    conversao = round(vendas / captacoes * 100, 1) if captacoes else 0.0

    earliest = min(l.created_at for l in leads)
    latest = max(l.created_at for l in leads)
    # nao mostra meses antes de quando o agente realmente comecou (ver ativo_desde
    # acima) -- um lead antigo reatribuido a ele nao deve "abrir" o grafico la atras
    if ativo_desde and ativo_desde > earliest:
        earliest = ativo_desde
    trend = []
    year, mon = earliest.year, earliest.month
    while (year, mon) <= (latest.year, latest.month):
        key = f"{year}-{mon:02d}"
        m = monthly.get(key, {"captacoes": 0, "vendas": 0, "receita": 0.0})
        trend.append({
            "mes": key,
            "mes_label": f"{MESES_ABREV[mon]}/{str(year)[2:]}",
            "captacoes": m["captacoes"],
            "vendas": m["vendas"],
            "receita": m["receita"],
        })
        mon += 1
        if mon > 12:
            mon = 1
            year += 1

    show_fin = can_see_financials(current_user)

    # bucket do proprio agente no ranking, usado tanto no de receita (admin/diretor)
    # quanto no geral por captacoes/vendas (todo mundo)
    current_key = "o2 Solution" if any(p.strip().lower() in O2_NAMES for p in parts) else next(
        (p.strip() for p in parts if not _is_organico(p)), parts[0].strip()
    )

    ranking = None
    if show_fin:
        origin_rows = db.query(Lead.origin, Lead.receita_real_recebida).filter(
            Lead.origin.isnot(None), Lead.origin != "", *date_filters,
        ).all()
        buckets: dict = defaultdict(float)
        for origin, recebido in origin_rows:
            key = _ranking_bucket(origin)
            if key is None:
                continue
            buckets[key] += float(recebido or 0)
        buckets[current_key] = receita_recebida

        ordered = sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
        posicao = next(i + 1 for i, (k, _) in enumerate(ordered) if k == current_key)
        ranking = {
            "posicao": posicao,
            "total": len(ordered),
            "leaderboard": [{"nome": k, "receita": v, "voce": k == current_key} for k, v in ordered[:5]],
        }

    # ranking geral por captacoes/vendas -- sem valor financeiro, visivel pra
    # qualquer agente ver a propria posicao no time inteiro
    count_rows = db.query(Lead.origin, Lead.status).filter(
        Lead.origin.isnot(None), Lead.origin != "", *date_filters,
    ).all()
    count_buckets: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0})
    for origin, status in count_rows:
        key = _ranking_bucket(origin)
        if key is None:
            continue
        count_buckets[key]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            count_buckets[key]["vendas"] += 1
    count_buckets[current_key] = {"captacoes": captacoes, "vendas": vendas}

    def _rank_by(metric: str):
        ordered = sorted(count_buckets.items(), key=lambda kv: kv[1][metric], reverse=True)
        posicao = next(i + 1 for i, (k, _) in enumerate(ordered) if k == current_key)
        return {
            "posicao": posicao,
            "total": len(ordered),
            "leaderboard": [{"nome": k, "valor": v[metric], "voce": k == current_key} for k, v in ordered],
        }

    ranking_geral = {"captacoes": _rank_by("captacoes"), "vendas": _rank_by("vendas")}

    status_rows = (
        db.query(LeadStatusHistory.changed_at, LeadStatusHistory.to_status, Lead.name, Lead.id)
        .join(Lead, Lead.id == LeadStatusHistory.lead_id)
        .filter(Lead.origin.in_(parts))
        .order_by(LeadStatusHistory.changed_at.desc())
        .limit(60)
        .all()
    )
    note_rows = (
        db.query(LeadNote.created_at, LeadNote.content, Lead.name, Lead.id)
        .join(Lead, Lead.id == LeadNote.lead_id)
        .filter(Lead.origin.in_(parts))
        .order_by(LeadNote.created_at.desc())
        .limit(60)
        .all()
    )
    schedule_rows = (
        db.query(LeadSchedule.created_at, Lead.name, Lead.id)
        .join(Lead, Lead.id == LeadSchedule.lead_id)
        .filter(Lead.origin.in_(parts), LeadSchedule.is_active.is_(True))
        .order_by(LeadSchedule.created_at.desc())
        .limit(60)
        .all()
    )

    atividades = []
    for changed_at, to_status, nome, lead_id in status_rows:
        atividades.append({"tipo": "status", "lead_nome": nome, "lead_id": str(lead_id), "detalhe": to_status, "em": changed_at.isoformat()})
    for created_at, content, nome, lead_id in note_rows:
        resumo = (content or "").strip().replace("\n", " ")
        if len(resumo) > 90:
            resumo = resumo[:87] + "…"
        atividades.append({"tipo": "nota", "lead_nome": nome, "lead_id": str(lead_id), "detalhe": resumo, "em": created_at.isoformat()})
    for created_at, nome, lead_id in schedule_rows:
        atividades.append({"tipo": "agendamento", "lead_nome": nome, "lead_id": str(lead_id), "detalhe": None, "em": created_at.isoformat()})
    atividades.sort(key=lambda a: a["em"], reverse=True)

    return {
        "captacoes": captacoes,
        "em_andamento": em_andamento,
        "cancelados": cancelados,
        "vendas": vendas,
        "conversao": conversao,
        "receita_recebida": receita_recebida if show_fin else None,
        "receita_a_receber": receita_a_receber if show_fin else None,
        "receita_potencial": receita_potencial if show_fin else None,
        "primeiro_lead_em": earliest.isoformat(),
        "ativo_desde": ativo_desde.isoformat() if ativo_desde else earliest.isoformat(),
        "meta": meta,
        "trend": [{**t, "receita": t["receita"] if show_fin else None} for t in trend],
        "ranking": ranking,
        "ranking_geral": ranking_geral,
        "atividades": atividades[:100],
    }
