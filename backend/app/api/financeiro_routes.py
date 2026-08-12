from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models.lead import Lead, LeadParcela
from app.models.user import User
from app.security import can_see_financials

router = APIRouter(prefix="/api/v1/financeiro", tags=["financeiro"])


def _is_atrasado(parcela: LeadParcela) -> bool:
    """Uma parcela 'a receber' cuja previsao de recebimento ja passou."""
    return (
        parcela.status == "a_receber"
        and parcela.previsao_recebimento is not None
        and parcela.previsao_recebimento.date() < datetime.utcnow().date()
    )


def _apply_search(q, model, search: Optional[str]):
    """Filtra por nome/titular, telefone, email ou documento (CPF/CNPJ)."""
    if not search or not search.strip():
        return q
    like = f"%{search.strip()}%"
    return q.filter(or_(
        model.receita_titular.ilike(like),
        model.name.ilike(like),
        model.phone.ilike(like),
        model.email.ilike(like),
        model.document.ilike(like),
    ))


def _apply_canal(q, model, canal: Optional[str]):
    """'adm' = leads com origin/visibility_tag/conversion_point = ADM (venda administrativa,
    sem passar pelo Followize). 'equipe' = o restante (captacao normal da equipe)."""
    if canal not in ("adm", "equipe"):
        return q

    def _eq_adm(col):
        return func.upper(func.trim(col)) == "ADM"

    def _neq_adm(col):
        # NULL nao deve virar "desconhecido" aqui -- trata coluna vazia como "nao e ADM" (mesmo padrao de database.py)
        return or_(col.is_(None), func.upper(func.trim(col)) != "ADM")

    if canal == "adm":
        return q.filter(or_(_eq_adm(model.visibility_tag), _eq_adm(model.origin), _eq_adm(model.conversion_point)))
    return q.filter(and_(_neq_adm(model.visibility_tag), _neq_adm(model.origin), _neq_adm(model.conversion_point)))


@router.get("/contratos")
def list_contratos(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    canal: Optional[str] = Query(None, description="'adm' ou 'equipe'"),
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
    q = _apply_search(q, Lead, search)
    q = _apply_canal(q, Lead, canal)

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
                "atrasado": _is_atrasado(r),
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
            "temAtraso": any(p["atrasado"] for p in parcelas_by_lead.get(lead.id, [])),
        }
        for lead in leads
    ]


@router.get("/previsao-periodo")
def previsao_periodo(
    date_from: str = Query(..., description="Inicio do intervalo, YYYY-MM-DD"),
    date_to: str = Query(..., description="Fim do intervalo (inclusive), YYYY-MM-DD"),
    search: Optional[str] = Query(None),
    canal: Optional[str] = Query(None, description="'adm' ou 'equipe'"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Parcelas (recebidas ou a receber) com previsao de recebimento dentro do
    intervalo informado, usadas quando o filtro de periodo da tela tem inicio e
    fim definidos (qualquer recorte de datas, nao precisa ser um mes inteiro).
    Cobre tanto meses futuros (a receber) quanto meses passados ja quitados
    (recebido) -- mostra o que aconteceu naquele periodo, nao so o pendente."""
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores e diretores")

    try:
        inicio = datetime.strptime(date_from, "%Y-%m-%d")
        fim = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        raise HTTPException(status_code=400, detail="Parâmetros 'date_from'/'date_to' inválidos, use YYYY-MM-DD")

    q = (
        db.query(LeadParcela, Lead)
        .join(Lead, Lead.id == LeadParcela.lead_id)
        .filter(
            LeadParcela.previsao_recebimento >= inicio,
            LeadParcela.previsao_recebimento <= fim,
        )
    )
    q = _apply_search(q, Lead, search)
    q = _apply_canal(q, Lead, canal)
    rows = q.order_by(LeadParcela.previsao_recebimento.asc()).all()

    parcelas = [
        {
            "leadId": str(lead.id),
            "empresa": lead.receita_titular or lead.company or lead.name,
            "promotora": lead.receita_promotora or "Sem promotora",
            "modalidade": lead.receita_modalidade or "Sem modalidade",
            "numero": parcela.numero,
            "valor": float(parcela.valor),
            "status": parcela.status,
            "previsaoRecebimento": parcela.previsao_recebimento.strftime("%Y-%m-%d"),
            "atrasado": _is_atrasado(parcela),
        }
        for parcela, lead in rows
    ]

    recebido = sum(p["valor"] for p in parcelas if p["status"] == "recebido")
    a_receber = sum(p["valor"] for p in parcelas if p["status"] == "a_receber")

    return {
        "dateFrom": date_from,
        "dateTo": date_to,
        "totalRecebido": round(recebido, 2),
        "totalAReceber": round(a_receber, 2),
        "contratosCount": len({p["leadId"] for p in parcelas}),
        "parcelas": parcelas,
    }
