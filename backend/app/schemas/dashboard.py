from pydantic import BaseModel
from typing import List


class TodayMetrics(BaseModel):
    leads_today: int
    meta_daily: int
    meta_monthly: int
    leads_monthly: int
    value_pipeline: float
    average_ticket: float
    qualified_leads: int
    conversion_rate: float


class OperatorLeadsToday(BaseModel):
    name: str
    leads_today: int


class TopOperatorsResponse(BaseModel):
    operators: List[OperatorLeadsToday]


class DayLeads(BaseModel):
    date: str
    leads: int


class Last7DaysResponse(BaseModel):
    days: List[DayLeads]


class OperatorRanking(BaseModel):
    name: str
    leads: int
    qualified: int


class OperatorsRankingResponse(BaseModel):
    ranking: List[OperatorRanking]


class OperatorCapture(BaseModel):
    name: str
    leads_today: int


class DailyCaptureResponse(BaseModel):
    operators: List[OperatorCapture]
