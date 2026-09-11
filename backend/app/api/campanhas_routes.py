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
CANAIS: tuple[Canal, ...] = ("whatsapp", "email", "sms")
FILA_ATIVA = ("fila", "disparado_sem_resposta")

# rodízio fixo, nesta ordem, contador simples e global (guardado em AppSettings)
RODIZIO_NOMES = ["Pamela", "Isaac", "Julia"]


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


def _pode_trabalhar_fila(current_user: User, isaac: User) -> bool:
    return current_user.id == isaac.id or _is_admin(current_user)


def _proximo_rodizio(db: Session) -> User:
    """Contador simples e global, girando entre Pamela/Isaac/Julia."""
    from app.models.app_settings import AppSettings
    row = db.query(AppSettings).filter(AppSettings.key == "campanha_rodizio_idx").first()
    idx = int(row.value) if row and row.value and row.value.lstrip("-").isdigit() else 0
    nome = RODIZIO_NOMES[idx % len(RODIZIO_NOMES)]
    vencedor = _find_user_by_name(db, nome)
    if not vencedor:
        raise HTTPException(status_code=500, detail=f"Usuário do rodízio '{nome}' não encontrado.")
    if row:
        row.value = str(idx + 1)
    else:
        db.add(AppSettings(key="campanha_rodizio_idx", value=str(idx + 1)))
    return vencedor


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


@router.get("/fila/contagem")
def contagem_fila(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Quantos leads aguardam ação em cada canal — pros contadores das
    sub-abas. Só quem pode trabalhar a fila (Isaac ou admin)."""
    isaac = _isaac(db)
    if not _pode_trabalhar_fila(current_user, isaac):
        raise HTTPException(status_code=403, detail="Apenas Isaac ou administradores podem ver a fila de campanhas")
    rows = (
        db.query(Lead.campanha_canal, func.count(Lead.id))
        .filter(Lead.renutricao_owner_id == isaac.id, Lead.campanha_status.in_(FILA_ATIVA))
        .group_by(Lead.campanha_canal)
        .all()
    )
    counts = {canal: 0 for canal in CANAIS}
    for canal, n in rows:
        if canal in counts:
            counts[canal] = n
    return counts


@router.get("/fila")
def listar_fila(
    canal: Canal,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Leads aguardando ação do Isaac num canal — a tela de trabalho."""
    isaac = _isaac(db)
    if not _pode_trabalhar_fila(current_user, isaac):
        raise HTTPException(status_code=403, detail="Apenas Isaac ou administradores podem ver a fila de campanhas")
    leads = (
        db.query(Lead)
        .filter(Lead.renutricao_owner_id == isaac.id, Lead.campanha_canal == canal, Lead.campanha_status.in_(FILA_ATIVA))
        .order_by(Lead.updated_at.desc())
        .all()
    )
    return [
        {
            "id": str(lead.id),
            "name": lead.name,
            "phone": lead.phone,
            "email": lead.email,
            "origem": lead.origin,
            "modalidade": lead.modalidade,
            "status": lead.status,
            "perception": lead.perception,
            "value_potential": float(lead.value_potential) if lead.value_potential is not None else None,
            "campanha_status": lead.campanha_status,
            "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
        }
        for lead in leads
    ]


class DesfechoRequest(BaseModel):
    desfecho: Literal["disparado_sem_resposta", "respondeu", "nao_retrabalhar"]


@router.post("/{lead_id}/desfecho")
def marcar_desfecho(
    lead_id: str,
    body: DesfechoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Isaac marca o resultado da tentativa naquele canal. 'Respondeu' sorteia
    o próximo do rodízio (Pamela/Isaac/Julia) e transfere a posse do lead pra
    ele, recontando a captação (retrabalhado_em). 'Não retrabalhar' solta o
    lead de volta (sem dono de renutrição). Ambos saem da fila e limpam o
    canal ativo -- o histórico completo já está gravado em campanha_eventos."""
    isaac = _isaac(db)
    if not _pode_trabalhar_fila(current_user, isaac):
        raise HTTPException(status_code=403, detail="Apenas Isaac ou administradores podem marcar desfechos de campanha")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead or not lead.campanha_canal or lead.campanha_status not in FILA_ATIVA:
        raise HTTPException(status_code=404, detail="Lead não está ativo em campanha")

    canal = lead.campanha_canal
    canal_label = CANAL_LABEL[canal]
    quem = current_user.first_name or current_user.username

    if body.desfecho == "disparado_sem_resposta":
        lead.campanha_status = "disparado_sem_resposta"
        db.add(CampanhaEvento(lead_id=lead.id, canal=canal, acao="disparado_sem_resposta", por_user_id=current_user.id))
        db.add(LeadNote(lead_id=lead.id, user_id=current_user.id, content=f"Disparo por {canal_label} sem resposta ({quem})."))

    elif body.desfecho == "respondeu":
        vencedor = _proximo_rodizio(db)
        vencedor_label = vencedor.first_name or vencedor.username
        lead.renutricao_owner_id = vencedor.id
        lead.attendant = vencedor_label
        lead.retrabalhado_em = datetime.now(timezone.utc).replace(tzinfo=None)
        lead.campanha_status = "respondeu"
        lead.campanha_canal = None
        db.add(CampanhaEvento(
            lead_id=lead.id, canal=canal, acao="respondeu",
            por_user_id=current_user.id, distribuido_para_user_id=vencedor.id,
        ))
        db.add(LeadNote(
            lead_id=lead.id, user_id=current_user.id,
            content=f"Respondeu no {canal_label} — distribuído pra {vencedor_label} via rodízio.",
        ))

    else:  # nao_retrabalhar
        lead.is_renutrucao = False
        lead.renutricao_owner_id = None
        lead.campanha_status = "nao_retrabalhar"
        lead.campanha_canal = None
        db.add(CampanhaEvento(lead_id=lead.id, canal=canal, acao="nao_retrabalhar", por_user_id=current_user.id))
        db.add(LeadNote(lead_id=lead.id, user_id=current_user.id, content=f"Marcado como 'não retrabalhar' no {canal_label} ({quem})."))

    db.commit()
    return {"success": True}
