from datetime import datetime, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.api.leads_routes import _is_admin
from app.database import get_db
from app.models import Lead, LeadNote, CampanhaEvento, User

router = APIRouter(prefix="/api/v1/campanhas", tags=["campanhas"])

Canal = Literal["whatsapp", "email", "sms"]
CANAL_LABEL = {"whatsapp": "WhatsApp", "email": "e-mail", "sms": "SMS"}


def _find_user_by_name(db: Session, nome: str) -> User | None:
    return (
        db.query(User)
        .filter(or_(func.lower(User.first_name) == nome.lower(), func.lower(User.username) == nome.lower()))
        .first()
    )


def _isaac(db: Session) -> User:
    user = _find_user_by_name(db, "Isaac")
    if not user:
        raise HTTPException(status_code=500, detail="Usuário 'Isaac' não encontrado — cadastre a conta antes de usar Campanhas.")
    return user


class EnviarCampanhaRequest(BaseModel):
    lead_ids: List[str]
    canal: Canal


@router.post("/enviar")
def enviar_para_campanha(
    body: EnviarCampanhaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Manda um lote de leads pra fila de disparo do Isaac num canal. O lead
    fica "travado" (dono = Isaac, is_renutrucao=True) igual renutrição: some
    da visão dos outros e o sync do Followize para de mexer nele até sair da
    campanha (respondeu ou não retrabalhar)."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Apenas administradores podem enviar leads pra campanha")
    isaac = _isaac(db)
    admin_label = current_user.first_name or current_user.username

    leads = db.query(Lead).filter(Lead.id.in_(body.lead_ids)).all()
    for lead in leads:
        lead.renutricao_owner_id = isaac.id
        lead.is_renutrucao = True
        lead.attendant = isaac.first_name or isaac.username
        lead.campanha_canal = body.canal
        lead.campanha_status = "fila"
        db.add(CampanhaEvento(lead_id=lead.id, canal=body.canal, acao="enviado_para_campanha", por_user_id=current_user.id))
        db.add(LeadNote(
            lead_id=lead.id, user_id=current_user.id,
            content=f"Enviado pra campanha de {CANAL_LABEL[body.canal]} por {admin_label}.",
        ))
    db.commit()
    return {"enviados": len(leads)}
