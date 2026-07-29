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
                "previsaoRecebimento": r.previsao_recebimento.strftime("%Y-%m-%d") if r.previsao_recebimento else None,
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


@router.get("/previsao-mes")
def previsao_mes(
    mes: str = Query(..., description="Mes alvo no formato YYYY-MM"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parcelas 'a_receber' com previsao de recebimento dentro do mes informado,
    usadas quando o filtro de periodo da tela foca em um unico mes."""
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores e diretores")

    try:
        ano, mes_num = (int(p) for p in mes.split("-"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Parâmetro 'mes' inválido, use YYYY-MM")

    inicio = datetime(ano, mes_num, 1)
    fim = datetime(ano + 1, 1, 1) if mes_num == 12 else datetime(ano, mes_num + 1, 1)

    rows = (
        db.query(LeadParcela, Lead)
        .join(Lead, Lead.id == LeadParcela.lead_id)
        .filter(
            LeadParcela.status == "a_receber",
            LeadParcela.previsao_recebimento >= inicio,
            LeadParcela.previsao_recebimento < fim,
        )
        .order_by(LeadParcela.previsao_recebimento.asc())
        .all()
    )

    parcelas = [
        {
            "leadId": str(lead.id),
            "empresa": lead.receita_titular or lead.company or lead.name,
            "promotora": lead.receita_promotora or "Sem promotora",
            "modalidade": lead.receita_modalidade or "Sem modalidade",
            "numero": parcela.numero,
            "valor": float(parcela.valor),
            "previsaoRecebimento": parcela.previsao_recebimento.strftime("%Y-%m-%d"),
        }
        for parcela, lead in rows
    ]

    return {
        "mes": mes,
        "totalPrevisto": round(sum(p["valor"] for p in parcelas), 2),
        "contratosCount": len({p["leadId"] for p in parcelas}),
        "parcelas": parcelas,
    }
