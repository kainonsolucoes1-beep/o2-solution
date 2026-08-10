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
    conversion_point: Optional[str] = None
    modalidade: Optional[str] = None
    faixa_0_18: Optional[int] = 0
    faixa_19_23: Optional[int] = 0
    faixa_24_28: Optional[int] = 0
    faixa_29_33: Optional[int] = 0
    faixa_34_38: Optional[int] = 0
    faixa_39_43: Optional[int] = 0
    faixa_44_48: Optional[int] = 0
    faixa_49_53: Optional[int] = 0
    faixa_54_58: Optional[int] = 0
    faixa_59_mais: Optional[int] = 0


_FAIXA_LABELS = [
    ("faixa_0_18", "00-18 anos"),
    ("faixa_19_23", "19-23 anos"),
    ("faixa_24_28", "24-28 anos"),
    ("faixa_29_33", "29-33 anos"),
    ("faixa_34_38", "34-38 anos"),
    ("faixa_39_43", "39-43 anos"),
    ("faixa_44_48", "44-48 anos"),
    ("faixa_49_53", "49-53 anos"),
    ("faixa_54_58", "54-58 anos"),
    ("faixa_59_mais", "59+ anos"),
]


def _build_notes(body: "PublicLeadCreate") -> Optional[str]:
    """Monta as observacoes do lead: mensagem livre (se houver) + o bloco
    'Campos customizados' no mesmo formato usado pelos leads antigos do
    Followize (ex: '24-28 anos: 1')."""
    parts = []
    if body.message and body.message.strip():
        parts.append(body.message.strip())
    faixas_lines = [f"{label}: {getattr(body, field)}" for field, label in _FAIXA_LABELS if getattr(body, field)]
    if faixas_lines:
        parts.append("Campos customizados:\n" + "\n".join(faixas_lines))
    return "\n\n".join(parts) if parts else None


def _next_attendant(db: Session) -> Optional[str]:
    """Roda a fila de atendentes (round-robin) guardada em AppSettings.
    Bloqueia as duas linhas (FOR UPDATE) para evitar corrida entre leads
    simultaneos pegando o mesmo indice."""
    attendants_row = (
        db.query(AppSettings)
        .filter(AppSettings.key == "public_leads_attendants")
        .with_for_update()
        .first()
    )
    names = [n.strip() for n in (attendants_row.value or "").split(",") if n.strip()] if attendants_row else []
    if not names:
        return None

    index_row = (
        db.query(AppSettings)
        .filter(AppSettings.key == "public_leads_rr_index")
        .with_for_update()
        .first()
    )
    current = int(index_row.value) if index_row and index_row.value and index_row.value.isdigit() else 0
    current = current % len(names)
    attendant = names[current]

    next_index = str((current + 1) % len(names))
    if index_row:
        index_row.value = next_index
    else:
        db.add(AppSettings(key="public_leads_rr_index", value=next_index))
    return attendant


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
    attendant = _next_attendant(db)
    lead = Lead(
        name=name,
        email=body.email,
        phone=body.phone,
        company=body.company,
        notes=_build_notes(body),
        origin=body.origin or "Orgânico",
        conversion_point=body.conversion_point,
        modalidade=body.modalidade,
        attendant=attendant,
        status="novo",
        user_id=default_user.id if default_user else None,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return {"success": True, "lead_id": str(lead.id)}
