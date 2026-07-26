import calendar
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadStatusHistory, LeadNote, LeadSchedule
from app.models.user import User
from app.security import can_see_financials

router = APIRouter(prefix="/api/v1/gestao-comercial", tags=["gestao-comercial"])

VENDA_STATUSES      = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
HOT_WARM_PERCEPTIONS = ("Quente", "Morno")
CANCELADO_STATUS    = "sale_not_performed"
AGENDAMENTO_STATUSES = ("qualificado", "scheduled")
PROPOSTA_STATUSES   = ("proposta", "proposal_sent", "negociacao")

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
    now = datetime.utcnow()
    return now.year, now.month


def _month_range(year: int, mon: int, until_day: int | None = None):
    dt_from = datetime(year, mon, 1)
    last_day = calendar.monthrange(year, mon)[1]
    end_day = min(until_day, last_day) if until_day else last_day
    dt_to = datetime(year, mon, end_day, 23, 59, 59)
    return dt_from, dt_to


def _resolve_range(month: str | None, until_day: int | None, start: str | None, end: str | None):
    if start and end:
        dt_from = datetime.strptime(start, "%Y-%m-%d")
        dt_to = datetime.strptime(end, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
        return dt_from, dt_to
    year, mon = _parse_month(month)
    return _month_range(year, mon, until_day)


def _team_clause(team: str | None):
    if not team:
        return []
    parts = [s.strip() for s in team.split(",") if s.strip()]
    if not parts:
        return []
    return [Lead.team.in_(parts)] if len(parts) > 1 else [Lead.team == parts[0]]


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
    team_clause = _team_clause(team)

    leads = db.query(Lead.status, Lead.value_potential, Lead.perception).filter(
        Lead.created_at >= dt_from, Lead.created_at <= dt_to, *team_clause,
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
            db.query(LeadStatusHistory.lead_id, Lead.value_potential)
            .join(Lead, Lead.id == LeadStatusHistory.lead_id)
            .filter(
                LeadStatusHistory.changed_at >= dt_from,
                LeadStatusHistory.changed_at <= dt_to,
                func.lower(LeadStatusHistory.to_status).in_(venda_set),
                *team_clause,
            )
            .all()
        )
        venda_leads = {lead_id: float(value or 0) for lead_id, value in rows}
        vendas = len(venda_leads)
    else:
        vendas = sum(1 for s, _, _ in leads if (s or "").lower() in venda_set)

    leads_com_valor = [float(v) for s, v, _ in leads if (s or "").lower() != CANCELADO_STATUS and v]
    receita_potencial = sum(leads_com_valor)
    perda_financeira = sum(float(v or 0) for s, v, _ in leads if (s or "").lower() == CANCELADO_STATUS)
    ticket_medio = receita_potencial / len(leads_com_valor) if leads_com_valor else 0.0
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
        func.date(Lead.created_at).label("day"),
        Lead.status,
    ).filter(Lead.created_at >= dt_from, Lead.created_at <= dt_to, *_team_clause(team)).all()

    venda_set = {s.lower() for s in VENDA_STATUSES}
    daily: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0})
    for day, status in rows:
        key = str(day)
        daily[key]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            daily[key]["vendas"] += 1

    result = []
    cur = dt_from.date()
    last = dt_to.date()
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
            Lead.created_at >= dt_from, Lead.created_at <= dt_to,
            Lead.origin.isnot(None), Lead.origin != "",
            *_team_clause(team),
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
    team: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    leads = (
        db.query(Lead.modalidade, Lead.status)
        .filter(
            Lead.created_at >= dt_from, Lead.created_at <= dt_to,
            Lead.modalidade.isnot(None), Lead.modalidade != "",
            *_team_clause(team),
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
    now = datetime.utcnow()
    result = []
    team_clause = _team_clause(team)

    for i in range(5, -1, -1):
        mon = now.month - i
        year = now.year
        while mon <= 0:
            mon += 12
            year -= 1

        dt_from, dt_to = _month_range(year, mon)
        leads = db.query(Lead.status, Lead.value_potential).filter(
            Lead.created_at >= dt_from, Lead.created_at <= dt_to, *team_clause,
        ).all()

        venda_set = {s.lower() for s in VENDA_STATUSES}
        captacoes = len(leads)
        vendas = sum(1 for s, _ in leads if (s or "").lower() in venda_set)
        receita = sum(float(v or 0) for s, v in leads if (s or "").lower() in venda_set)

        result.append({
            "mes": f"{year}-{mon:02d}",
            "mes_label": f"{calendar.month_abbr[mon]}/{str(year)[2:]}",
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
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
        Lead.value_potential.isnot(None),
        Lead.value_potential > 0,
        *_team_clause(team),
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
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
        Lead.value_potential.isnot(None),
        Lead.value_potential > 0,
        *_team_clause(team),
    ]

    if tipo == "vendas":
        filters.append(Lead.status.in_(VENDA_STATUSES))
        if status:
            filters.append(Lead.status == status)
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
            filters.append(Lead.status == status)

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

    leads = (
        db.query(Lead.origin, Lead.status, Lead.value_potential)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.origin.isnot(None),
            Lead.origin != "",
        )
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
    filters = [Lead.origin.isnot(None), Lead.origin != "", *_team_clause(team)]
    if origens:
        parts = [s.strip() for s in origens.split(",") if s.strip()]
        if len(parts) == 1:
            filters.append(Lead.origin == parts[0])
        elif parts:
            filters.append(Lead.origin.in_(parts))
    if date_from:
        filters.append(Lead.created_at >= datetime.strptime(date_from, "%Y-%m-%d"))
    if date_to:
        filters.append(Lead.created_at <= datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59))

    leads = (
        db.query(Lead.origin, Lead.status, Lead.value_potential, Lead.created_at)
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
            "captacoes": cap,
            "cancelados": counts["cancelados"],
            "vendas": ven,
            "receita": counts["receita"],
            "conversao": round(ven / cap * 100, 1) if cap > 0 else 0.0,
        })
    operadores.sort(key=lambda x: x["receita"], reverse=True)

    if not leads:
        return {"operadores": operadores, "trend": []}

    monthly: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "receita": 0.0})
    for _, status, value, created_at in leads:
        key = f"{created_at.year}-{created_at.month:02d}"
        monthly[key]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            monthly[key]["vendas"] += 1
            monthly[key]["receita"] += float(value or 0)

    earliest = min(l.created_at for l in leads)
    latest = max(l.created_at for l in leads)
    trend = []
    year, mon = earliest.year, earliest.month
    while (year, mon) <= (latest.year, latest.month):
        key = f"{year}-{mon:02d}"
        m = monthly.get(key, {"captacoes": 0, "vendas": 0, "receita": 0.0})
        trend.append({
            "mes": key,
            "mes_label": f"{calendar.month_abbr[mon]}/{str(year)[2:]}",
            "captacoes": m["captacoes"],
            "vendas": m["vendas"],
            "receita": m["receita"],
        })
        mon += 1
        if mon > 12:
            mon = 1
            year += 1

    return {"operadores": operadores, "trend": trend}


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
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
        Lead.conversion_point.isnot(None),
        Lead.conversion_point != "",
        *_team_clause(team),
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


@router.get("/vida-sdr")
def vida_sdr(
    origens: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Historico vitalicio de um SDR/origem: funil, conversao e receita real desde o primeiro lead."""
    parts = [s.strip() for s in origens.split(",") if s.strip()]

    leads = (
        db.query(Lead.status, Lead.receita_real_recebida, Lead.receita_real_a_receber, Lead.created_at)
        .filter(Lead.origin.in_(parts))
        .all()
    ) if parts else []

    if not leads:
        return {
            "captacoes": 0, "em_andamento": 0, "cancelados": 0, "vendas": 0,
            "conversao": 0.0, "receita_recebida": 0.0, "receita_a_receber": 0.0,
            "primeiro_lead_em": None, "trend": [],
        }

    venda_set = {s.lower() for s in VENDA_STATUSES}
    captacoes = len(leads)
    vendas = 0
    cancelados = 0
    receita_recebida = 0.0
    receita_a_receber = 0.0
    monthly: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "receita": 0.0})

    for status, recebido, a_receber, created_at in leads:
        s = (status or "").lower()
        if s in venda_set:
            vendas += 1
        elif s == CANCELADO_STATUS:
            cancelados += 1
        receita_recebida += float(recebido or 0)
        receita_a_receber += float(a_receber or 0)

        key = f"{created_at.year}-{created_at.month:02d}"
        monthly[key]["captacoes"] += 1
        if s in venda_set:
            monthly[key]["vendas"] += 1
        monthly[key]["receita"] += float(recebido or 0)

    em_andamento = captacoes - vendas - cancelados
    conversao = round(vendas / captacoes * 100, 1) if captacoes else 0.0

    earliest = min(l.created_at for l in leads)
    latest = max(l.created_at for l in leads)
    trend = []
    year, mon = earliest.year, earliest.month
    while (year, mon) <= (latest.year, latest.month):
        key = f"{year}-{mon:02d}"
        m = monthly.get(key, {"captacoes": 0, "vendas": 0, "receita": 0.0})
        trend.append({
            "mes": key,
            "mes_label": f"{calendar.month_abbr[mon]}/{str(year)[2:]}",
            "captacoes": m["captacoes"],
            "vendas": m["vendas"],
            "receita": m["receita"],
        })
        mon += 1
        if mon > 12:
            mon = 1
            year += 1

    show_fin = can_see_financials(current_user)

    ranking = None
    if show_fin:
        origin_rows = db.query(Lead.origin, Lead.receita_real_recebida).filter(
            Lead.origin.isnot(None), Lead.origin != "",
        ).all()
        buckets: dict = defaultdict(float)
        for origin, recebido in origin_rows:
            key = _ranking_bucket(origin)
            if key is None:
                continue
            buckets[key] += float(recebido or 0)

        current_key = "o2 Solution" if any(p.strip().lower() in O2_NAMES for p in parts) else next(
            (p.strip() for p in parts if not _is_organico(p)), parts[0].strip()
        )
        buckets[current_key] = receita_recebida

        ordered = sorted(buckets.items(), key=lambda kv: kv[1], reverse=True)
        posicao = next(i + 1 for i, (k, _) in enumerate(ordered) if k == current_key)
        ranking = {
            "posicao": posicao,
            "total": len(ordered),
            "leaderboard": [{"nome": k, "receita": v, "voce": k == current_key} for k, v in ordered[:5]],
        }

    status_rows = (
        db.query(LeadStatusHistory.changed_at, LeadStatusHistory.to_status, Lead.name)
        .join(Lead, Lead.id == LeadStatusHistory.lead_id)
        .filter(Lead.origin.in_(parts))
        .order_by(LeadStatusHistory.changed_at.desc())
        .limit(60)
        .all()
    )
    note_rows = (
        db.query(LeadNote.created_at, LeadNote.content, Lead.name)
        .join(Lead, Lead.id == LeadNote.lead_id)
        .filter(Lead.origin.in_(parts))
        .order_by(LeadNote.created_at.desc())
        .limit(60)
        .all()
    )
    schedule_rows = (
        db.query(LeadSchedule.created_at, Lead.name)
        .join(Lead, Lead.id == LeadSchedule.lead_id)
        .filter(Lead.origin.in_(parts), LeadSchedule.is_active.is_(True))
        .order_by(LeadSchedule.created_at.desc())
        .limit(60)
        .all()
    )

    atividades = []
    for changed_at, to_status, nome in status_rows:
        atividades.append({"tipo": "status", "lead_nome": nome, "detalhe": to_status, "em": changed_at.isoformat()})
    for created_at, content, nome in note_rows:
        resumo = (content or "").strip().replace("\n", " ")
        if len(resumo) > 90:
            resumo = resumo[:87] + "…"
        atividades.append({"tipo": "nota", "lead_nome": nome, "detalhe": resumo, "em": created_at.isoformat()})
    for created_at, nome in schedule_rows:
        atividades.append({"tipo": "agendamento", "lead_nome": nome, "detalhe": None, "em": created_at.isoformat()})
    atividades.sort(key=lambda a: a["em"], reverse=True)

    return {
        "captacoes": captacoes,
        "em_andamento": em_andamento,
        "cancelados": cancelados,
        "vendas": vendas,
        "conversao": conversao,
        "receita_recebida": receita_recebida if show_fin else None,
        "receita_a_receber": receita_a_receber if show_fin else None,
        "primeiro_lead_em": earliest.isoformat(),
        "trend": [{**t, "receita": t["receita"] if show_fin else None} for t in trend],
        "ranking": ranking,
        "atividades": atividades[:100],
    }
