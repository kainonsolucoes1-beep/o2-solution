from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Lead, LeadNote, User
from app.schemas.lead import (
    LeadCreate, LeadReportItem, LeadResponse, LeadsReportResponse,
    StatusUpdateRequest, StatusUpdateResponse,
    NoteCreateRequest, NoteCreateResponse,
    NoteResponse, NotesListResponse,
)
from app.schemas.user import OperatorInfo

router = APIRouter(prefix="/api/v1", tags=["leads"])


def _is_admin(user: User) -> bool:
    return user.role == "admin" or user.username == "lucas"


@router.get("/leads", response_model=List[LeadResponse])
def list_leads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Lead)
    if not _is_admin(current_user):
        q = q.filter(Lead.user_id == current_user.id)
    return q.all()


@router.post("/leads", response_model=LeadResponse, status_code=201)
def create_lead(
    lead_data: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if lead_data.email:
        duplicate = (
            db.query(Lead)
            .filter(Lead.user_id == current_user.id, Lead.email == lead_data.email)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Já existe um lead com este email")

    lead = Lead(**lead_data.model_dump(), user_id=current_user.id)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.get("/leads/by-period", response_model=LeadsReportResponse)
def leads_by_period(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    origem: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        start = datetime.strptime(date_from, "%Y-%m-%d")
        end = datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")

    admin = _is_admin(current_user)
    my_name = current_user.first_name or current_user.username

    def _base_query(q):
        q = q.filter(Lead.created_at >= start, Lead.created_at < end)
        if not admin:
            q = q.filter(Lead.origin == my_name)
        elif origem:
            q = q.filter(Lead.origin == origem)
        return q

    total = _base_query(db.query(func.count(Lead.id))).scalar() or 0

    rows = (
        _base_query(
            db.query(
                Lead.id, Lead.name, Lead.email, Lead.phone,
                Lead.company, Lead.attendant,
                Lead.status, Lead.value_potential, Lead.created_at, Lead.origin,
            )
        )
        .order_by(Lead.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    leads = [
        LeadReportItem(
            id=r.id, name=r.name, email=r.email, phone=r.phone,
            company=r.company, attendant=r.attendant,
            status=r.status,
            value_potential=float(r.value_potential) if r.value_potential is not None else None,
            created_at=r.created_at,
            origem=r.origin,
        )
        for r in rows
    ]

    return LeadsReportResponse(total=total, page=page, limit=limit, leads=leads)


@router.get("/users", response_model=List[OperatorInfo])
def list_operators(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    rows = db.query(User).filter(User.is_active.is_(True)).order_by(User.first_name).all()
    return [OperatorInfo(id=r.id, name=r.first_name or r.username) for r in rows]


@router.get("/leads/origins", response_model=List[str])
def list_origins(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    rows = (
        db.query(Lead.origin)
        .filter(Lead.origin.isnot(None), Lead.origin != "")
        .distinct()
        .order_by(Lead.origin)
        .all()
    )
    return [r.origin for r in rows]
