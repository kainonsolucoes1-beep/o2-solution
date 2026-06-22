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

    leads = (
        db.query(Lead.origin, Lead.status)
        .filter(Lead.created_at >= date_from, Lead.created_at <= date_to)
        .filter(Lead.origin.isnot(None), Lead.origin != "")
        .all()
    )

    venda_set    = {s.lower() for s in VENDA_STATUSES}
    cancelado_set = {s.lower() for s in CANCELADO_STATUSES}

    data: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0, "cancelados": 0})
    for origin, status in leads:
        fonte = (origin or "").strip() or "Sem origem"
        data[fonte]["captacoes"] += 1
        s = (status or "").lower()
        if s in venda_set:
            data[fonte]["vendas"] += 1
        elif s in cancelado_set:
            data[fonte]["cancelados"] += 1

    result = []
    for fonte, counts in sorted(data.items(), key=lambda x: x[1]["captacoes"], reverse=True):
        cap = counts["captacoes"]
        result.append({
            "fonte":      fonte,
            "captacoes":  cap,
            "vendas":     counts["vendas"],
            "cancelados": counts["cancelados"],
            "conversao":  round(counts["vendas"] / cap * 100, 1) if cap > 0 else 0.0,
        })

    return result
