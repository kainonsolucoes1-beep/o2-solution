import calendar
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
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
