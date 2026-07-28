from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadParcela
from app.models.user import User
from app.security import can_see_financials

router = APIRouter(prefix="/api/v1/financeiro", tags=["financeiro"])


@router.get("/contratos")
def list_contratos(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores e diretores")

    q = db.query(Lead).filter(
        (Lead.receita_real_recebida > 0) | (Lead.receita_real_a_receber > 0)
    )
    if date_from:
        q = q.filter(Lead.receita_data_venda >= datetime.strptime(date_from, "%Y-%m-%d"))
    if date_to:
        q = q.filter(Lead.receita_data_venda <= datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59))

    leads = q.order_by(Lead.receita_data_venda.desc().nullslast()).all()

    parcelas_by_lead: dict = {}
    if leads:
        lead_ids = [lead.id for lead in leads]
        rows = (
            db.query(LeadParcela)
            .filter(LeadParcela.lead_id.in_(lead_ids))
            .order_by(LeadParcela.numero.asc().nullsfirst())
            .all()
        )
        for r in rows:
            parcelas_by_lead.setdefault(r.lead_id, []).append({
                "numero": r.numero,
                "valor": float(r.valor),
                "status": r.status,
            })

    return [
        {
            "id": str(lead.id),
            "empresa": lead.receita_titular or lead.company or lead.name,
            "promotora": lead.receita_promotora or "Sem promotora",
            "modalidade": lead.receita_modalidade or "Sem modalidade",
            "valorContrato": float(lead.receita_real_recebida or 0) + float(lead.receita_real_a_receber or 0),
            "recebido": float(lead.receita_real_recebida or 0),
            "aReceber": float(lead.receita_real_a_receber or 0),
            "parcelas": parcelas_by_lead.get(lead.id, []),
        }
        for lead in leads
    ]
