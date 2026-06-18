from pydantic import BaseModel
from typing import Optional, List
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


class LeadReportItem(BaseModel):
    id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    attendant: Optional[str] = None
    origem: Optional[str] = None
    status: Optional[str] = None
    perception: Optional[str] = None
    value_potential: Optional[float] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class LeadsReportResponse(BaseModel):
    total: int
    page: int
    limit: int
    leads: List[LeadReportItem]


class StatusUpdateRequest(BaseModel):
    status: str


class StatusUpdateResponse(BaseModel):
    success: bool
    lead_id: UUID
    status: str


class NoteCreateRequest(BaseModel):
    content: str


class NoteCreateResponse(BaseModel):
    success: bool
    note_id: UUID
    created_at: datetime


class NoteResponse(BaseModel):
    id: UUID
    content: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class NotesListResponse(BaseModel):
    notes: List[NoteResponse]


class StatusHistoryItem(BaseModel):
    id: UUID
    from_status: Optional[str] = None
    to_status: str
    changed_at: datetime
    changed_by: Optional[str] = None

    class Config:
        from_attributes = True


class StatusHistoryResponse(BaseModel):
    history: List[StatusHistoryItem]