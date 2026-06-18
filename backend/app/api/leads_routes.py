from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Lead, LeadNote, LeadStatusHistory, User
from app.schemas.lead import (
    LeadCreate, LeadReportItem, LeadResponse, LeadsReportResponse,
    StatusUpdateRequest, StatusUpdateResponse,
    NoteCreateRequest, NoteCreateResponse,
    NoteResponse, NotesListResponse,
    StatusHistoryItem, StatusHistoryResponse,
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
    status: Optional[str] = Query(None),
    perception: Optional[str] = Query(None),
    vencidos: bool = Query(False),
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

    cutoff_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    admin = _is_admin(current_user)
    my_name = current_user.first_name or current_user.username

    _active_statuses = ("pending", "novo", "new", "scheduled", "qualificado", "qualified", "proposal_sent")
    _active_filter = or_(
        func.lower(Lead.status).in_([s.lower() for s in _active_statuses]),
        Lead.perception.in_(["Quente", "Morno"]),
    )

    def _base_query(q):
        if vencidos:
            q = q.filter(Lead.updated_at <= cutoff_24h, _active_filter)
        else:
            q = q.filter(Lead.created_at >= start, Lead.created_at < end)
        if not admin:
            q = q.filter(Lead.origin == my_name)
        elif origem:
            q = q.filter(Lead.origin == origem)
        if status:
            statuses = [s.strip().lower() for s in status.split(',')]
            q = q.filter(func.lower(Lead.status).in_(statuses))
        if perception:
            percs = [p.strip() for p in perception.split(',')]
            q = q.filter(Lead.perception.in_(percs))
        return q

    total = _base_query(db.query(func.count(Lead.id))).scalar() or 0

    rows = (
        _base_query(
            db.query(
                Lead.id, Lead.name, Lead.email, Lead.phone,
                Lead.company, Lead.attendant,
                Lead.status, Lead.perception, Lead.value_potential, Lead.created_at, Lead.origin,
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
            status=r.status, perception=r.perception,
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


@router.post("/leads/{lead_id}/status", response_model=StatusUpdateResponse)
def update_lead_status(
    lead_id: str,
    body: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    prev_status = lead.status
    lead.status = body.status
    lead.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    history = LeadStatusHistory(
        lead_id=lead.id,
        from_status=prev_status,
        to_status=body.status,
        changed_at=lead.updated_at,
        changed_by=current_user.first_name or current_user.username,
    )
    db.add(history)
    db.commit()
    return StatusUpdateResponse(success=True, lead_id=lead.id, status=lead.status)


@router.get("/leads/{lead_id}/status-history", response_model=StatusHistoryResponse)
def get_status_history(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadStatusHistory)
        .filter(LeadStatusHistory.lead_id == lead_id)
        .order_by(LeadStatusHistory.changed_at.asc())
        .all()
    )
    return StatusHistoryResponse(history=rows)


@router.get("/leads/{lead_id}/notes", response_model=NotesListResponse)
def get_lead_notes(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadNote, User)
        .outerjoin(User, LeadNote.user_id == User.id)
        .filter(LeadNote.lead_id == lead_id)
        .order_by(LeadNote.created_at.desc())
        .all()
    )
    notes = [
        NoteResponse(
            id=note.id,
            content=note.content,
            created_by=(user.first_name or user.username) if user else "Usuário",
            created_at=note.created_at,
        )
        for note, user in rows
    ]
    return NotesListResponse(notes=notes)


@router.post("/leads/{lead_id}/notes", response_model=NoteCreateResponse)
def create_lead_note(
    lead_id: str,
    body: NoteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    note = LeadNote(lead_id=lead.id, user_id=current_user.id, content=body.content)
    db.add(note)
    db.commit()
    db.refresh(note)
    return NoteCreateResponse(success=True, note_id=note.id, created_at=note.created_at)
