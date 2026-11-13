"""Tela "Macro" (Financeiro): onde esta' o dinheiro, etapa por etapa da escada de certeza.

  Em negociacao (em analise)  -> leads em andamento, valor = cotacao (value_potential)
  Em emissao (provavel)       -> status emissao, operadora/promotora/valor do ultimo envio (lead_emissoes)
  Aguardando faturamento      -> status waiting_billing; promotora/operadora do envio ou da planilha
  A receber (garantido)       -> lead_parcelas a_receber com previsao ate' o fim do periodo
  Historico 12 meses          -> lead_parcelas recebidas nos ultimos 12 meses

Devolve as linhas (nao agregados) -- a tela agrupa por operadora/promotora/responsavel
e monta os paineis laterais; volume e' de centenas de linhas.
Acesso: so' perfis financeiros (admin, diretor, financeiro, coordenador).
"""
import calendar
from datetime import datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Lead, LeadEmissao, LeadParcela, LeadStatusHistory, User
from app.security import can_see_financials
from app.tz_utils import BR_OFFSET, now_br

router = APIRouter(prefix="/api/v1/macro", tags=["macro"])

# grafias cruas -> etapa da negociacao (mesma ordem do funil)
NEG_CANON = {
    "novo": "novo", "new": "novo", "pending": "novo",
    "aguardando_dados": "aguardando_dados",
    "sem_retorno": "sem_retorno",
    "qualificado": "agendado", "qualified": "agendado", "scheduled": "agendado",
    "proposta": "proposta", "proposal_sent": "proposta", "proposal sent": "proposta",
    "negociacao": "proposta", "negociação": "proposta",
    "pendencia": "pendencia", "pendência": "pendencia",
    "documentacao_pendente": "pendencia", "documentação pendente": "pendencia",
}
EMISSAO = ("emissao", "emissão")
FATURAMENTO = ("waiting_billing", "waiting billing")


def _f(v) -> float:
    return float(v) if v is not None else 0.0


def _dias(ts: datetime | None, hoje) -> int | None:
    """Dias de calendario (Brasilia) entre o timestamp (UTC naive) e hoje."""
    if ts is None:
        return None
    return (hoje - (ts - BR_OFFSET).date()).days


def _primeira(lista: str | None) -> str | None:
    if not lista:
        return None
    p = lista.split(",")[0].strip()
    return p or None


@router.get("/promotoras")
def promotoras(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[str]:
    """Sugestoes pro campo Promotora da janela "Enviar para emissao": nomes ja' usados
    nas emissoes e na planilha de receita."""
    a = db.query(LeadEmissao.promotora).filter(LeadEmissao.promotora.isnot(None)).distinct().all()
    b = db.query(Lead.receita_promotora).filter(Lead.receita_promotora.isnot(None)).distinct().all()
    nomes = {(r[0] or "").strip() for r in a + b}
    return sorted((n for n in nomes if n), key=str.lower)


@router.get("/resumo")
def resumo(
    periodo: Literal["30", "90", "365"] = Query("30"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Sem permissão")

    agora = now_br()
    hoje = agora.date()

    # ultima mudanca de status por lead (= "dias sem avancar" / "dias na etapa")
    ult = (
        db.query(LeadStatusHistory.lead_id.label("lid"), func.max(LeadStatusHistory.changed_at).label("em"))
        .group_by(LeadStatusHistory.lead_id).subquery()
    )
    # ultimo envio pra emissao por lead
    ult_em = (
        db.query(LeadEmissao.lead_id.label("lid"), func.max(LeadEmissao.enviado_em).label("em"))
        .group_by(LeadEmissao.lead_id).subquery()
    )
    envio = {}
    for e in (
        db.query(LeadEmissao)
        .join(ult_em, (LeadEmissao.lead_id == ult_em.c.lid) & (LeadEmissao.enviado_em == ult_em.c.em))
        .all()
    ):
        envio[e.lead_id] = e

    base = (
        db.query(Lead, ult.c.em)
        .outerjoin(ult, ult.c.lid == Lead.id)
        .filter(Lead.duplicado_de_id.is_(None))
    )

    def _lead(l: Lead) -> dict:
        return {"id": str(l.id), "nome": l.name, "modalidade": l.modalidade, "vidas": l.vidas, "responsavel": l.attendant}

    neg = []
    for l, mudou in base.filter(func.lower(Lead.status).in_(list(NEG_CANON))).all():
        neg.append({
            **_lead(l),
            "etapa": NEG_CANON[(l.status or "").lower()],
            "valor": _f(l.value_potential),
            "operadora": _primeira(l.operadoras_enviadas),
            "dias": _dias(mudou or l.created_at, hoje),
        })

    def _contrato(l: Lead, mudou) -> dict:
        e = envio.get(l.id)
        return {
            **_lead(l),
            "valor": _f(e.valor if e and e.valor is not None else l.value_potential),
            "operadora": (e.operadora if e else None) or l.receita_operadora,
            "promotora": (e.promotora if e else None) or l.receita_promotora,
            "dias": _dias(mudou or (e.enviado_em if e else None) or l.created_at, hoje),
        }

    emissao = [_contrato(l, m) for l, m in base.filter(func.lower(Lead.status).in_(EMISSAO)).all()]
    faturamento = [_contrato(l, m) for l, m in base.filter(func.lower(Lead.status).in_(FATURAMENTO)).all()]

    # A receber: previsao ate' o fim do periodo (atrasadas entram -- ainda nao viraram caixa)
    if periodo == "30":
        fim_local = datetime(hoje.year, hoje.month, calendar.monthrange(hoje.year, hoje.month)[1]) + timedelta(days=1)
    else:
        fim_local = datetime(hoje.year, hoje.month, hoje.day) + timedelta(days=int(periodo) + 1)
    # previsao_recebimento / receita_data_venda sao datas puras (sem fuso) -- comparar direto com o dia local
    hoje_dt = datetime(hoje.year, hoje.month, hoje.day)

    total_parc = dict(
        db.query(LeadParcela.lead_id, func.count(LeadParcela.id))
        .filter(LeadParcela.descricao.is_(None)).group_by(LeadParcela.lead_id).all()
    )
    parcelas = []
    for p, l in (
        db.query(LeadParcela, Lead).join(Lead, Lead.id == LeadParcela.lead_id)
        .filter(LeadParcela.status == "a_receber", LeadParcela.previsao_recebimento.isnot(None),
                LeadParcela.previsao_recebimento < fim_local)
        .order_by(LeadParcela.previsao_recebimento).all()
    ):
        e = envio.get(l.id)
        parcelas.append({
            "lead_id": str(l.id), "nome": l.name, "modalidade": l.modalidade, "vidas": l.vidas,
            "numero": p.numero, "de": total_parc.get(l.id), "valor": _f(p.valor),
            "vence": p.previsao_recebimento.date().isoformat(),
            "atrasada": p.previsao_recebimento < hoje_dt,
            "operadora": l.receita_operadora or (e.operadora if e else None),
            "promotora": l.receita_promotora or (e.promotora if e else None),
            "responsavel": l.attendant,
        })

    # Historico: recebido nos ultimos 12 meses (data = previsao da parcela; sem ela, data da venda)
    ref = func.coalesce(LeadParcela.previsao_recebimento, Lead.receita_data_venda)
    hist = [
        {"operadora": l.receita_operadora, "promotora": l.receita_promotora, "valor": _f(p.valor)}
        for p, l in (
            db.query(LeadParcela, Lead).join(Lead, Lead.id == LeadParcela.lead_id)
            .filter(LeadParcela.status == "recebido", ref >= hoje_dt - timedelta(days=365), ref < hoje_dt + timedelta(days=1))
            .all()
        )
    ]

    return {
        "hoje": hoje.isoformat(),
        "fim_periodo": (fim_local - timedelta(days=1)).date().isoformat(),
        "negociacao": neg,
        "emissao": emissao,
        "faturamento": faturamento,
        "parcelas": parcelas,
        "historico": hist,
    }
