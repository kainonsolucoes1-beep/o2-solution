import time
from collections import defaultdict, deque
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lead, User
from app.models.app_settings import AppSettings

router = APIRouter(prefix="/api/v1/public", tags=["public"])

_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 10
_rate_limit_hits: dict[str, deque] = defaultdict(deque)


def _check_rate_limit(ip: str):
    now = time.time()
    hits = _rate_limit_hits[ip]
    while hits and now - hits[0] > _RATE_LIMIT_WINDOW:
        hits.popleft()
    if len(hits) >= _RATE_LIMIT_MAX:
        raise HTTPException(status_code=429, detail="Muitas requisições. Tente novamente em instantes.")
    hits.append(now)


class PublicLeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    message: Optional[str] = None
    origin: Optional[str] = None


@router.post("/leads", status_code=201)
def create_public_lead(
    body: PublicLeadCreate,
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str = Header(..., alias="X-API-Key"),
):
    _check_rate_limit(request.client.host if request.client else "unknown")

    expected = db.query(AppSettings).filter(AppSettings.key == "public_leads_api_key").first()
    if not expected or not expected.value or x_api_key != expected.value:
        raise HTTPException(status_code=403, detail="Chave inválida")

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Nome é obrigatório")
    if not body.email and not body.phone:
        raise HTTPException(status_code=422, detail="Informe email ou telefone")

    existing = None
    if body.email:
        existing = db.query(Lead).filter(Lead.email == body.email).first()
    if not existing and body.phone:
        existing = db.query(Lead).filter(Lead.phone == body.phone, Lead.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail="Lead já cadastrado")

    default_user = db.query(User).first()
    lead = Lead(
        name=name,
        email=body.email,
        phone=body.phone,
        company=body.company,
        notes=body.message,
        origin=body.origin or "Site",
        status="novo",
        user_id=default_user.id if default_user else None,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return {"success": True, "lead_id": str(lead.id)}
