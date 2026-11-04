"""Área do parceiro de tráfego (perfil "trafego"): conferência, só leitura,
dos leads da campanha Meta Ads. A regra do que aparece fica em
app/trafego_scope.py; aqui ela é aplicada de novo, explícita na query."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.api.public_routes import _STATUS_PUBLICO
from app.database import get_db
from app.models.lead import Lead
from app.models.user import User
from app.trafego_scope import FORM_REGIAO, TRAFEGO_LEADS_DESDE, TRAFEGO_ROLE, trafego_lead_criteria

router = APIRouter(prefix="/api/v1/parceiro", tags=["parceiro"])


@router.get("/leads")
def parceiro_leads(
    busca: Optional[str] = Query(None, max_length=100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # admin também entra, pra conferir o que o parceiro vê
    if current_user.role not in (TRAFEGO_ROLE, "admin"):
        raise HTTPException(status_code=403, detail="Sem permissão.")

    q = db.query(Lead).filter(trafego_lead_criteria(Lead))
    termo = (busca or "").strip()
    if termo:
        like = f"%{termo}%"
        q = q.filter(or_(Lead.name.ilike(like), Lead.email.ilike(like), Lead.phone.ilike(like)))
    leads = q.order_by(Lead.created_at.desc()).limit(500).all()

    def iso(dt):
        return dt.isoformat() + "Z" if dt else None

    return {
        "desde": TRAFEGO_LEADS_DESDE.isoformat(),
        "leads": [
            {
                # só dados de conferência da campanha: nada de notas internas,
                # atendente, valores ou histórico
                "id": str(l.id),
                "nome": l.name,
                "telefone": l.phone,
                "email": l.email,
                "status_label": _STATUS_PUBLICO.get((l.status or "").lower(), l.status or ""),
                "criado_em": iso(l.created_at),
                "formulario": l.conversion_point,
                "regiao": FORM_REGIAO.get((l.conversion_point or "").strip()),
                "campanha": l.tracking_campaign,
                "conjunto": l.tracking_term,
                "anuncio": l.tracking_format,
                "plano_atual": l.current_plan,
                "modalidade": l.modalidade,
            }
            for l in leads
        ],
    }
