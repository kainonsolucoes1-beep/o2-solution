import os
from datetime import date, timedelta
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import func, cast, Date
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
)

router = APIRouter(prefix="/api/v1/dashboard", tags=["dashboard"])

META_DAILY = int(os.getenv("META_DAILY", 10))
META_MONTHLY = int(os.getenv("META_MONTHLY", 200))
QUALIFIED_STATUSES = ("qualificado", "qualified", "convertido")


@router.get("/today-metrics", response_model=TodayMetrics)
def today_metrics(db: Session = Depends(get_db)):
    today = date.today()
    first_of_month = today.replace(day=1)

    leads_today = (
        db.query(func.count(Lead.id))
        .filter(cast(Lead.created_at, Date) == today)
        .scalar() or 0
    )

    leads_monthly = (
        db.query(func.count(Lead.id))
        .filter(cast(Lead.created_at, Date) >= first_of_month)
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
        .filter(
            cast(Lead.created_at, Date) == today,
            Lead.status.in_(QUALIFIED_STATUSES),
        )
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
    today = date.today()

    rows = (
        db.query(
            func.coalesce(User.first_name, User.username).label("name"),
            func.count(Lead.id).label("leads_today"),
        )
        .join(User, Lead.user_id == User.id)
        .filter(cast(Lead.created_at, Date) == today)
        .group_by(User.id, User.first_name, User.username)
        .order_by(func.count(Lead.id).desc())
        .limit(3)
        .all()
    )

    return TopOperatorsResponse(
        operators=[OperatorLeadsToday(name=r.name, leads_today=r.leads_today) for r in rows]
    )


@router.get("/last-7-days", response_model=Last7DaysResponse)
def last_7_days(db: Session = Depends(get_db)):
    today = date.today()
    start = today - timedelta(days=6)

    rows = (
        db.query(
            cast(Lead.created_at, Date).label("day"),
            func.count(Lead.id).label("leads"),
        )
        .filter(cast(Lead.created_at, Date) >= start)
        .group_by(cast(Lead.created_at, Date))
        .order_by(cast(Lead.created_at, Date))
        .all()
    )

    counts = {str(r.day): r.leads for r in rows}
    days: List[DayLeads] = []
    for i in range(7):
        d = str(start + timedelta(days=i))
        days.append(DayLeads(date=d, leads=counts.get(d, 0)))

    return Last7DaysResponse(days=days)


@router.get("/operators-ranking", response_model=OperatorsRankingResponse)
def operators_ranking(db: Session = Depends(get_db)):
    rows = (
        db.query(
            func.coalesce(User.first_name, User.username).label("name"),
            func.count(Lead.id).label("leads"),
            func.count(Lead.id)
            .filter(Lead.status.in_(QUALIFIED_STATUSES))
            .label("qualified"),
        )
        .join(User, Lead.user_id == User.id)
        .group_by(User.id, User.first_name, User.username)
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
