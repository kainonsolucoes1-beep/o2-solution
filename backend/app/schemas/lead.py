from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime

class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    origin: Optional[str] = None
    status: Optional[str] = "novo"
    value_potential: Optional[float] = None
    notes: Optional[str] = None

class LeadResponse(LeadCreate):
    id: UUID
    user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True