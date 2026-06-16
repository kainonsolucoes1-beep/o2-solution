import os
from datetime import datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func, cast, Date, and_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.lead import Lead
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
        .scalar() or 0.0
    )

    average_ticket = (
        db.query(func.coalesce(func.avg(Lead.value_potential), 0))
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
