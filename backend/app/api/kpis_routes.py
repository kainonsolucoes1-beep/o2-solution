import calendar
import re
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.lead_utils import extract_base as _extract_base
from app.models.lead import Lead
from app.models.user import User

router = APIRouter(prefix="/api/v1/kpis", tags=["kpis"])

VENDA_STATUSES    = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
CANCELADO_STATUSES = ("sale_not_performed",)


@router.get("/conversao-fonte")
def conversao_por_fonte(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        now = datetime.utcnow()
        year, mon = now.year, now.month

    date_from = datetime(year, mon, 1)
    date_to   = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    base_filter = [
        Lead.created_at >= date_from,
        Lead.created_at <= date_to,
        Lead.origin.isnot(None),
        Lead.origin != "",
    ]

    leads = (
        db.query(Lead.origin, Lead.status, Lead.conversion_point)
        .filter(*base_filter)
        .all()
    )

    # Renutrição counts per origin (subset — not a new origin)
    rn_leads = (
        db.query(Lead.origin, Lead.status)
        .filter(*base_filter, Lead.is_renutrucao == True)
        .all()
    )

    venda_set     = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    rn_by_fonte: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0})
    for origin, status in rn_leads:
        fonte = (origin or "").strip() or "Sem origem"
        rn_by_fonte[fonte]["captacoes"] += 1
        s = (status or "").lower()
        if s in venda_set:
            rn_by_fonte[fonte]["vendas"] += 1
        elif s in cancelado_set:
            rn_by_fonte[fonte]["cancelados"] += 1

    data: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0, "breakdown": defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0})})

    for origin, status, conv_point in leads:
        fonte = (origin or "").strip() or "Sem origem"
        data[fonte]["captacoes"] += 1
        s = (status or "").lower()
        if s in venda_set:
            data[fonte]["vendas"] += 1
        elif s in cancelado_set:
            data[fonte]["cancelados"] += 1

        if conv_point:
            bp = conv_point.strip().lower()
            data[fonte]["breakdown"][bp]["captacoes"] += 1
            if s in venda_set:
                data[fonte]["breakdown"][bp]["vendas"] += 1
            elif s in cancelado_set:
                data[fonte]["breakdown"][bp]["cancelados"] += 1

    result = []
    for fonte, counts in sorted(data.items(), key=lambda x: x[1]["captacoes"], reverse=True):
        cap = counts["captacoes"]
        breakdown = []
        for label, bc in sorted(counts["breakdown"].items(), key=lambda x: x[1]["captacoes"], reverse=True):
            bcap = bc["captacoes"]
            breakdown.append({
                "label":      label,
                "captacoes":  bcap,
                "vendas":     bc["vendas"],
                "cancelados": bc["cancelados"],
                "conversao":  round(bc["vendas"] / bcap * 100, 1) if bcap > 0 else 0.0,
            })
        # Inject Renutrição as breakdown item if this fonte has flagged leads
        rn = rn_by_fonte.get(fonte)
        if rn and rn["captacoes"] > 0:
            rn_cap = rn["captacoes"]
            breakdown.insert(0, {
                "label":      "🔄 Renutrição",
                "captacoes":  rn_cap,
                "vendas":     rn["vendas"],
                "cancelados": rn["cancelados"],
                "conversao":  round(rn["vendas"] / rn_cap * 100, 1) if rn_cap > 0 else 0.0,
            })
        result.append({
            "fonte":      fonte,
            "captacoes":  cap,
            "vendas":     counts["vendas"],
            "cancelados": counts["cancelados"],
            "conversao":  round(counts["vendas"] / cap * 100, 1) if cap > 0 else 0.0,
            "breakdown":  breakdown,
        })

    return result


@router.get("/leads-vendas")
def leads_vendas_por_fonte(
    month: str = Query(None),
    fonte: str = Query(None),
    conv_point: str = Query(None),
    renutrucao: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            now = datetime.utcnow(); year, mon = now.year, now.month
    else:
        now = datetime.utcnow(); year, mon = now.year, now.month

    date_from = datetime(year, mon, 1)
    date_to   = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    filters = [
        Lead.created_at >= date_from,
        Lead.created_at <= date_to,
        Lead.status.in_(VENDA_STATUSES),
    ]
    if fonte:
        filters.append(Lead.origin.ilike(fonte))
    if conv_point:
        filters.append(Lead.conversion_point.ilike(conv_point))
    if renutrucao:
        filters.append(Lead.is_renutrucao == True)

    leads = (
        db.query(Lead.name, Lead.value_potential, Lead.updated_at)
        .filter(*filters)
        .order_by(Lead.updated_at.desc())
        .limit(30)
        .all()
    )
    return [
        {
            "nome":  l.name,
            "valor": float(l.value_potential) if l.value_potential else None,
            "data":  l.updated_at.strftime("%d/%m/%Y") if l.updated_at else None,
        }
        for l in leads
    ]


@router.get("/renutrucao")
def renutrucao_stats(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        now = datetime.utcnow()
        year, mon = now.year, now.month

    date_from = datetime(year, mon, 1)
    date_to   = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.status)
        .filter(
            Lead.is_renutrucao == True,
            Lead.created_at >= date_from,
            Lead.created_at <= date_to,
        )
        .all()
    )

    venda_set     = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    cap = len(leads)
    ven = sum(1 for (s,) in leads if (s or "").lower() in venda_set)
    can = sum(1 for (s,) in leads if (s or "").lower() in cancelado_set)

    return {
        "captacoes":  cap,
        "vendas":     ven,
        "cancelados": can,
        "conversao":  round(ven / cap * 100, 1) if cap > 0 else 0.0,
    }


@router.get("/motivos-cancelamento")
def motivos_cancelamento(
    month: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    origin: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if date_from and date_to:
        try:
            dt_from = datetime.strptime(date_from, "%Y-%m-%d")
            dt_to = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(hours=23, minutes=59, seconds=59)
        except ValueError:
            dt_from = datetime(datetime.utcnow().year, datetime.utcnow().month, 1)
            dt_to = datetime.utcnow()
    else:
        if month:
            try:
                year, mon = int(month[:4]), int(month[5:7])
            except (ValueError, IndexError):
                year, mon = datetime.utcnow().year, datetime.utcnow().month
        else:
            year, mon = datetime.utcnow().year, datetime.utcnow().month
        dt_from = datetime(year, mon, 1)
        dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    filters = [
        Lead.status == "sale_not_performed",
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
    ]
    if origin:
        parts = [s.strip() for s in origin.split(',') if s.strip()]
        if len(parts) == 1:
            filters.append(Lead.origin == parts[0])
        else:
            filters.append(Lead.origin.in_(parts))

    rows = (
        db.query(
            Lead.lost_reason,
            func.count(Lead.id).label("total"),
            func.coalesce(func.sum(Lead.value_potential), 0).label("total_value"),
        )
        .filter(*filters)
        .group_by(Lead.lost_reason)
        .order_by(func.count(Lead.id).desc())
        .all()
    )

    total = sum(r.total for r in rows)
    return [
        {
            "reason": r.lost_reason or "Não informado",
            "count": r.total,
            "pct": round(r.total / total * 100, 1) if total > 0 else 0.0,
            "total_value": float(r.total_value),
        }
        for r in rows
    ]


@router.get("/leads-conv-point")
def leads_conv_point(
    month: str = Query(None),
    date_from: str = Query(None),
    date_to: str = Query(None),
    conv_point: str = Query(None),
    origens: str = Query(None),
    status_group: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if date_from and date_to:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d")
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    else:
        if month:
            try:
                year, mon = int(month[:4]), int(month[5:7])
            except (ValueError, IndexError):
                year, mon = datetime.utcnow().year, datetime.utcnow().month
        else:
            year, mon = datetime.utcnow().year, datetime.utcnow().month

        dt_from = datetime(year, mon, 1)
        dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    filters = [Lead.created_at >= dt_from, Lead.created_at <= dt_to]
    if conv_point:
        filters.append(Lead.conversion_point.ilike(conv_point))
    if origens:
        parts = [s.strip() for s in origens.split(',') if s.strip()]
        if parts:
            filters.append(Lead.origin.in_(parts))
    if status_group == 'venda':
        filters.append(Lead.status.in_(VENDA_STATUSES))

    rows = (
        db.query(Lead.name, Lead.origin, Lead.status, Lead.value_potential)
        .filter(*filters)
        .order_by(Lead.created_at.desc())
        .all()
    )

    STATUS_PT = {
        "waiting_billing": "Aguard. Faturamento", "sale_performed": "Venda Realizada",
        "won": "Ganho", "fechado": "Fechado", "closed": "Fechado", "convertido": "Convertido",
        "sale_not_performed": "Cancelado", "novo": "Novo", "qualificado": "Qualificado",
        "scheduled": "Agendado", "proposta": "Proposta", "pending": "Novo",
        "proposal_sent": "Proposta Enviada", "negociacao": "Em Negociação",
    }
    venda_set    = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    result = []
    for l in rows:
        s = (l.status or "").lower()
        tipo = "venda" if s in venda_set else "perda" if s in cancelado_set else "ativo"
        result.append({
            "nome":   l.name or "Sem nome",
            "origem": l.origin or "—",
            "status": STATUS_PT.get(s, l.status or "—"),
            "valor":  float(l.value_potential) if l.value_potential else None,
            "tipo":   tipo,
        })
    return result


@router.get("/conv-point-detalhe")
def conv_point_detalhe(
    month: str = Query(None),
    conv_point: str = Query(...),
    origens: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    filters = [
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
        Lead.conversion_point.ilike(conv_point),
    ]
    if origens:
        parts = [s.strip() for s in origens.split(',') if s.strip()]
        if parts:
            filters.append(Lead.origin.in_(parts))

    leads = (
        db.query(Lead.status, Lead.value_potential, Lead.modalidade, Lead.current_plan)
        .filter(*filters)
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    captacoes = 0
    vendas = 0
    cancelados = 0
    receita = 0.0
    modalidades: dict = defaultdict(int)
    plano_possui = 0
    plano_nao_possui = 0
    plano_sem_info = 0

    for status, value, modalidade, current_plan in leads:
        captacoes += 1
        s = (status or "").lower()
        is_perdido = s in cancelado_set
        if s in venda_set:
            vendas += 1
        elif is_perdido:
            cancelados += 1

        if not is_perdido:
            if value:
                receita += float(value)
            modalidades[(modalidade or "").strip() or "Não informado"] += 1
            plano = (current_plan or "").strip()
            if not plano:
                plano_sem_info += 1
            elif plano.lower() == "não possui plano":
                plano_nao_possui += 1
            else:
                plano_possui += 1

    base_liquida = captacoes - cancelados
    plano_com_info = plano_possui + plano_nao_possui

    return {
        "conv_point": conv_point,
        "captacoes": captacoes,
        "cancelados": cancelados,
        "base_liquida": base_liquida,
        "vendas": vendas,
        "conversao": round(vendas / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "pct_perda": round(cancelados / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "receita_potencial": receita,
        "ticket_medio": round(receita / base_liquida, 2) if base_liquida > 0 else 0.0,
        "modalidades": sorted(
            [
                {"nome": k, "count": v, "pct": round(v / base_liquida * 100, 1) if base_liquida > 0 else 0.0}
                for k, v in modalidades.items()
            ],
            key=lambda x: x["count"], reverse=True,
        ),
        "plano": {
            "possui": plano_possui,
            "nao_possui": plano_nao_possui,
            "sem_informacao": plano_sem_info,
            "pct_possui": round(plano_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
            "pct_nao_possui": round(plano_nao_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
        },
    }


@router.get("/conv-point-diario")
def conv_point_diario(
    month: str = Query(None),
    conv_point: str = Query(...),
    origens: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    filters = [
        Lead.created_at >= dt_from,
        Lead.created_at <= dt_to,
        Lead.conversion_point.ilike(conv_point),
    ]
    if origens:
        parts = [s.strip() for s in origens.split(',') if s.strip()]
        if parts:
            filters.append(Lead.origin.in_(parts))

    rows = db.query(func.date(Lead.created_at).label("day"), Lead.status).filter(*filters).all()

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
            "date": key,
            "dia": cur.day,
            "captacoes": daily[key]["captacoes"],
            "vendas": daily[key]["vendas"],
        })
        cur += timedelta(days=1)

    return result


@router.get("/sdr-detalhe")
def sdr_detalhe(
    month: str = Query(None),
    nome: str = Query(...),
    origens: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    parts = [s.strip() for s in origens.split(',') if s.strip()]

    leads = (
        db.query(Lead.status, Lead.value_potential, Lead.modalidade, Lead.current_plan)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.origin.in_(parts),
        )
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    captacoes = 0
    vendas = 0
    cancelados = 0
    receita = 0.0
    modalidades: dict = defaultdict(int)
    plano_possui = 0
    plano_nao_possui = 0
    plano_sem_info = 0

    for status, value, modalidade, current_plan in leads:
        captacoes += 1
        s = (status or "").lower()
        is_perdido = s in cancelado_set
        if s in venda_set:
            vendas += 1
        elif is_perdido:
            cancelados += 1

        if not is_perdido:
            if value:
                receita += float(value)
            modalidades[(modalidade or "").strip() or "Não informado"] += 1
            plano = (current_plan or "").strip()
            if not plano:
                plano_sem_info += 1
            elif plano.lower() == "não possui plano":
                plano_nao_possui += 1
            else:
                plano_possui += 1

    base_liquida = captacoes - cancelados
    plano_com_info = plano_possui + plano_nao_possui

    return {
        "nome": nome,
        "captacoes": captacoes,
        "cancelados": cancelados,
        "base_liquida": base_liquida,
        "vendas": vendas,
        "conversao": round(vendas / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "pct_perda": round(cancelados / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "receita_potencial": receita,
        "ticket_medio": round(receita / base_liquida, 2) if base_liquida > 0 else 0.0,
        "modalidades": sorted(
            [
                {"nome": k, "count": v, "pct": round(v / base_liquida * 100, 1) if base_liquida > 0 else 0.0}
                for k, v in modalidades.items()
            ],
            key=lambda x: x["count"], reverse=True,
        ),
        "plano": {
            "possui": plano_possui,
            "nao_possui": plano_nao_possui,
            "sem_informacao": plano_sem_info,
            "pct_possui": round(plano_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
            "pct_nao_possui": round(plano_nao_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
        },
    }


@router.get("/bases")
def bases_analytics(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.notes, Lead.status)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.notes.isnot(None),
            Lead.notes.ilike('%Base%'),
        )
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    data: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0})
    for notes, status in leads:
        base = _extract_base(notes)
        if not base:
            continue
        s = (status or '').lower()
        data[base]["captacoes"] += 1
        if s in venda_set:
            data[base]["vendas"] += 1
        elif s in cancelado_set:
            data[base]["cancelados"] += 1

    result = []
    for base, counts in data.items():
        cap = counts["captacoes"]
        ven = counts["vendas"]
        can = counts["cancelados"]
        result.append({
            "base": base,
            "captacoes": cap,
            "vendas": ven,
            "cancelados": can,
            "conversao": round(ven / cap * 100, 1) if cap > 0 else 0.0,
            "pct_cancelamento": round(can / cap * 100, 1) if cap > 0 else 0.0,
        })

    result.sort(key=lambda x: x["captacoes"], reverse=True)
    return result


@router.get("/bases-detalhe")
def base_detalhe(
    month: str = Query(None),
    base: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.notes, Lead.status, Lead.value_potential, Lead.modalidade, Lead.current_plan)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.notes.isnot(None),
            Lead.notes.ilike('%Base%'),
        )
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}
    target = base.strip().lower()

    captacoes = 0
    vendas = 0
    cancelados = 0
    receita = 0.0
    modalidades: dict = defaultdict(int)
    plano_possui = 0
    plano_nao_possui = 0
    plano_sem_info = 0

    for notes, status, value, modalidade, current_plan in leads:
        b = _extract_base(notes)
        if not b or b.lower() != target:
            continue
        captacoes += 1
        s = (status or "").lower()
        is_perdido = s in cancelado_set
        if s in venda_set:
            vendas += 1
        elif is_perdido:
            cancelados += 1

        if not is_perdido:
            if value:
                receita += float(value)
            modalidades[(modalidade or "").strip() or "Não informado"] += 1
            plano = (current_plan or "").strip()
            if not plano:
                plano_sem_info += 1
            elif plano.lower() == "não possui plano":
                plano_nao_possui += 1
            else:
                plano_possui += 1

    base_liquida = captacoes - cancelados
    plano_com_info = plano_possui + plano_nao_possui

    return {
        "base": base,
        "captacoes": captacoes,
        "cancelados": cancelados,
        "base_liquida": base_liquida,
        "vendas": vendas,
        "conversao": round(vendas / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "pct_cancelamento": round(cancelados / captacoes * 100, 1) if captacoes > 0 else 0.0,
        "receita_potencial": receita,
        "ticket_medio": round(receita / base_liquida, 2) if base_liquida > 0 else 0.0,
        "modalidades": sorted(
            [
                {"nome": k, "count": v, "pct": round(v / base_liquida * 100, 1) if base_liquida > 0 else 0.0}
                for k, v in modalidades.items()
            ],
            key=lambda x: x["count"], reverse=True,
        ),
        "plano": {
            "possui": plano_possui,
            "nao_possui": plano_nao_possui,
            "sem_informacao": plano_sem_info,
            "pct_possui": round(plano_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
            "pct_nao_possui": round(plano_nao_possui / plano_com_info * 100, 1) if plano_com_info > 0 else 0.0,
        },
    }


@router.get("/leads-base")
def leads_base(
    month: str = Query(None),
    base: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.name, Lead.notes, Lead.status, Lead.value_potential)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.notes.isnot(None),
            Lead.notes.ilike('%Base%'),
        )
        .all()
    )

    STATUS_PT = {
        "waiting_billing": "Aguard. Faturamento", "sale_performed": "Venda Realizada",
        "won": "Ganho", "fechado": "Fechado", "closed": "Fechado", "convertido": "Convertido",
        "sale_not_performed": "Cancelado", "novo": "Novo", "qualificado": "Qualificado",
        "scheduled": "Agendado", "proposta": "Proposta", "pending": "Novo",
        "proposal_sent": "Proposta Enviada", "negociacao": "Em Negociação",
    }
    venda_set     = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}
    target = (base or '').strip().lower()

    result = []
    for name, notes, status, value in leads:
        b = _extract_base(notes)
        if not b or b.lower() != target:
            continue
        s = (status or '').lower()
        tipo = "venda" if s in venda_set else "perda" if s in cancelado_set else "ativo"
        result.append({
            "nome":   name or "Sem nome",
            "status": STATUS_PT.get(s, status or "—"),
            "valor":  float(value) if value else None,
            "tipo":   tipo,
        })
    return result


_AGE_BANDS = [
    (0,  18, "0–18"),
    (19, 23, "19–23"),
    (24, 28, "24–28"),
    (29, 33, "29–33"),
    (34, 38, "34–38"),
    (39, 43, "39–43"),
    (44, 48, "44–48"),
    (49, 53, "49–53"),
    (54, 58, "54–58"),
    (59, 999, "59+"),
]

_IDADE_RE   = re.compile(r'Idades?:?\*?\s*([\d][^|\n]{0,80})', re.IGNORECASE)
_TITULAR_RE = re.compile(r'(\d{1,3})\s*\(titular\)', re.IGNORECASE)


def _parse_ages(raw: str) -> list[int]:
    result = []
    for part in raw.split(','):
        part = part.strip()
        if part.endswith('m'):
            result.append(0)
        elif part.isdigit() and int(part) <= 110:
            result.append(int(part))
        else:
            nums = [int(x) for x in re.findall(r'\d+', part) if int(x) <= 110]
            result.extend(nums)
    return result


def _titular_age(ages_raw: str | None, notes: str | None) -> int | None:
    if notes:
        m = _TITULAR_RE.search(notes)
        if m:
            return int(m.group(1))
    for src in [ages_raw, None]:
        raw = src
        if raw is None and notes:
            m = _IDADE_RE.search(notes)
            raw = m.group(1) if m else None
        if raw:
            nums = _parse_ages(raw)
            adults = [n for n in nums if n >= 18]
            if adults:
                return adults[0]
            if nums:
                return nums[0]
    return None


def _age_band(age: int) -> str:
    for lo, hi, label in _AGE_BANDS:
        if lo <= age <= hi:
            return label
    return "59+"


@router.get("/faixas-etarias")
def faixas_etarias(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to   = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.ages_raw, Lead.notes, Lead.status)
        .filter(Lead.created_at >= dt_from, Lead.created_at <= dt_to)
        .all()
    )

    venda_set     = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    band_data: dict = {label: {"captacoes": 0, "vendas": 0, "cancelados": 0}
                       for _, _, label in _AGE_BANDS}
    sem_idade = 0

    for ages_raw, notes, status in leads:
        age = _titular_age(ages_raw, notes)
        if age is None:
            sem_idade += 1
            continue
        band = _age_band(age)
        s = (status or "").lower()
        band_data[band]["captacoes"] += 1
        if s in venda_set:
            band_data[band]["vendas"] += 1
        elif s in cancelado_set:
            band_data[band]["cancelados"] += 1

    result = []
    for _, _, label in _AGE_BANDS:
        d = band_data[label]
        cap = d["captacoes"]
        ven = d["vendas"]
        can = d["cancelados"]
        result.append({
            "faixa":           label,
            "captacoes":       cap,
            "vendas":          ven,
            "cancelados":      can,
            "conversao":       round(ven / cap * 100, 1) if cap > 0 else 0.0,
            "pct_cancelamento": round(can / cap * 100, 1) if cap > 0 else 0.0,
        })

    total_com_idade = sum(d["captacoes"] for d in result)
    return {
        "bands":         result,
        "sem_idade":     sem_idade,
        "com_idade":     total_com_idade,
    }


@router.get("/leads-faixa-etaria")
def leads_faixa_etaria(
    month: str = Query(None),
    faixa: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to   = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.name, Lead.ages_raw, Lead.notes, Lead.status, Lead.value_potential)
        .filter(Lead.created_at >= dt_from, Lead.created_at <= dt_to)
        .all()
    )

    STATUS_PT = {
        "waiting_billing": "Aguard. Faturamento", "sale_performed": "Venda Realizada",
        "won": "Ganho", "fechado": "Fechado", "closed": "Fechado", "convertido": "Convertido",
        "sale_not_performed": "Cancelado", "novo": "Novo", "qualificado": "Qualificado",
        "scheduled": "Agendado", "proposta": "Proposta", "pending": "Novo",
        "proposal_sent": "Proposta Enviada", "negociacao": "Em Negociação",
    }
    venda_set     = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    result = []
    for name, ages_raw, notes, status, value_potential in leads:
        age = _titular_age(ages_raw, notes)
        if age is None:
            continue
        if faixa and _age_band(age) != faixa:
            continue
        s = (status or "").lower()
        tipo = "venda" if s in venda_set else "perda" if s in cancelado_set else "ativo"
        result.append({
            "nome":   name or "Sem nome",
            "idade":  age,
            "status": STATUS_PT.get(s, status or "—"),
            "tipo":   tipo,
            "valor":  float(value_potential) if value_potential else None,
        })

    result.sort(key=lambda x: x["idade"])
    return result


@router.get("/plano-saude")
def plano_saude(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.current_plan, Lead.status)
        .filter(Lead.created_at >= dt_from, Lead.created_at <= dt_to)
        .all()
    )

    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    sem_informacao = 0
    nao_possui = 0
    data: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0})

    for current_plan, status in leads:
        plano = (current_plan or "").strip()
        if not plano:
            sem_informacao += 1
            continue
        s = (status or "").lower()
        if plano.lower() == "não possui plano":
            nao_possui += 1
            continue
        data[plano]["captacoes"] += 1
        if s in venda_set:
            data[plano]["vendas"] += 1
        elif s in cancelado_set:
            data[plano]["cancelados"] += 1

    operadoras = []
    for nome, counts in data.items():
        cap = counts["captacoes"]
        operadoras.append({
            "nome": nome,
            "captacoes": cap,
            "vendas": counts["vendas"],
            "cancelados": counts["cancelados"],
            "conversao": round(counts["vendas"] / cap * 100, 1) if cap > 0 else 0.0,
        })
    operadoras.sort(key=lambda x: x["captacoes"], reverse=True)

    possui_plano = sum(o["captacoes"] for o in operadoras)
    com_informacao = possui_plano + nao_possui

    return {
        "com_informacao": com_informacao,
        "sem_informacao": sem_informacao,
        "possui_plano": possui_plano,
        "nao_possui_plano": nao_possui,
        "pct_possui": round(possui_plano / com_informacao * 100, 1) if com_informacao > 0 else 0.0,
        "pct_nao_possui": round(nao_possui / com_informacao * 100, 1) if com_informacao > 0 else 0.0,
        "operadoras": operadoras,
    }


@router.get("/leads-plano-saude")
def leads_plano_saude(
    month: str = Query(None),
    plano: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    leads = (
        db.query(Lead.name, Lead.status, Lead.value_potential)
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            func.lower(Lead.current_plan) == plano.strip().lower(),
        )
        .all()
    )

    STATUS_PT = {
        "waiting_billing": "Aguard. Faturamento", "sale_performed": "Venda Realizada",
        "won": "Ganho", "fechado": "Fechado", "closed": "Fechado", "convertido": "Convertido",
        "sale_not_performed": "Cancelado", "novo": "Novo", "qualificado": "Qualificado",
        "scheduled": "Agendado", "proposta": "Proposta", "pending": "Novo",
        "proposal_sent": "Proposta Enviada", "negociacao": "Em Negociação",
    }
    venda_set = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    result = []
    for name, status, value in leads:
        s = (status or "").lower()
        tipo = "venda" if s in venda_set else "perda" if s in cancelado_set else "ativo"
        result.append({
            "nome": name or "Sem nome",
            "status": STATUS_PT.get(s, status or "—"),
            "valor": float(value) if value else None,
            "tipo": tipo,
        })
    return result


@router.get("/receita-potencial")
def receita_potencial(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if month:
        try:
            year, mon = int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            year, mon = datetime.utcnow().year, datetime.utcnow().month
    else:
        year, mon = datetime.utcnow().year, datetime.utcnow().month

    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)

    total = (
        db.query(func.coalesce(func.sum(Lead.value_potential), 0))
        .filter(
            Lead.created_at >= dt_from,
            Lead.created_at <= dt_to,
            Lead.status != "sale_not_performed",
        )
        .scalar()
    )
    return {"total": float(total)}
