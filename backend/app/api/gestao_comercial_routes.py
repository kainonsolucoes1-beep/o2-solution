import calendar
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User

router = APIRouter(prefix="/api/v1/gestao-comercial", tags=["gestao-comercial"])

VENDA_STATUSES = ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")
CANCELADO_STATUS = "sale_not_performed"


def _parse_month(month: str | None):
    if month:
        try:
            return int(month[:4]), int(month[5:7])
        except (ValueError, IndexError):
            pass
    now = datetime.utcnow()
    return now.year, now.month


def _month_range(year: int, mon: int):
    dt_from = datetime(year, mon, 1)
    dt_to = datetime(year, mon, calendar.monthrange(year, mon)[1], 23, 59, 59)
    return dt_from, dt_to


@router.get("/visao-geral")
def visao_geral(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    leads = db.query(Lead.status, Lead.value_potential).filter(
        Lead.created_at >= dt_from, Lead.created_at <= dt_to,
    ).all()

    venda_set = {s.lower() for s in VENDA_STATUSES}
    captacoes = len(leads)
    vendas = sum(1 for s, _ in leads if (s or "").lower() in venda_set)
    receita = sum(float(v or 0) for s, v in leads if (s or "").lower() in venda_set)
    perda_financeira = sum(float(v or 0) for s, v in leads if (s or "").lower() == CANCELADO_STATUS)
    ticket_medio = receita / vendas if vendas > 0 else 0.0
    conversao = round(vendas / captacoes * 100, 1) if captacoes > 0 else 0.0

    return {
        "captacoes": captacoes,
        "vendas": vendas,
        "conversao": conversao,
        "receita": receita,
        "perda_financeira": perda_financeira,
        "ticket_medio": ticket_medio,
    }


@router.get("/evolucao-diaria")
def evolucao_diaria(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    rows = db.query(
        func.date(Lead.created_at).label("day"),
        Lead.status,
    ).filter(Lead.created_at >= dt_from, Lead.created_at <= dt_to).all()

    venda_set = {s.lower() for s in VENDA_STATUSES}
    daily: dict = defaultdict(lambda: {"captacoes": 0, "vendas": 0})
    for day, status in rows:
        key = str(day)
        daily[key]["captacoes"] += 1
        if (status or "").lower() in venda_set:
            daily[key]["vendas"] += 1

    days_in_month = calendar.monthrange(year, mon)[1]
    return [
        {
            "dia": d,
            "captacoes": daily[f"{year}-{mon:02d}-{d:02d}"]["captacoes"],
            "vendas": daily[f"{year}-{mon:02d}-{d:02d}"]["vendas"],
        }
        for d in range(1, days_in_month + 1)
    ]


@router.get("/origens-captacao")
def origens_captacao(
    month: str = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    year, mon = _parse_month(month)
    dt_from, dt_to = _month_range(year, mon)

    rows = (
        db.query(Lead.origin, func.count(Lead.id).label("captacoes"))
        .filter(
            Lead.created_at >= dt_from, Lead.created_at <= dt_to,
            Lead.origin.isnot(None), Lead.origin != "",
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


@router.get("/comparativo-mensal")
def comparativo_mensal(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    result = []

    for i in range(5, -1, -1):
        mon = now.month - i
        year = now.year
        while mon <= 0:
            mon += 12
            year -= 1

        dt_from, dt_to = _month_range(year, mon)
        leads = db.query(Lead.status, Lead.value_potential).filter(
            Lead.created_at >= dt_from, Lead.created_at <= dt_to,
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
