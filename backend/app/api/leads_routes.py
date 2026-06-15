from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Lead, User
from app.schemas.lead import LeadCreate, LeadResponse
from app.api.auth_routes import get_current_user

router = APIRouter(prefix="/api/v1", tags=["leads"])


@router.get("/leads", response_model=List[LeadResponse])
def list_leads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return db.query(Lead).filter(Lead.user_id == current_user.id).all()


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
