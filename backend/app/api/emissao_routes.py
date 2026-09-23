"""Indicador "Emissao de contrato": quantos leads foram enviados pra emissao junto a
operadora, valor dos contratos, por operadora e por operador (quem enviou).

Fonte: lead_emissoes (1 linha por envio, criada pela janela "Enviar para emissao").
Envios anteriores a essa janela nao tem linha -- entram pelo historico de status
(to_status='emissao') como "Sem operadora", com o valor da cotacao, pra o
indicador ja' nascer com dados reais.
"""
from collections import defaultdict
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import Lead, LeadEmissao, LeadStatusHistory, User
from app.operadoras import OPERADORAS_EMISSAO
from app.tz_utils import BR_OFFSET, br_date_to_utc_range, now_br

router = APIRouter(prefix="/api/v1/emissao", tags=["emissao"])

PARADO_DIAS = 3
SEM_OPERADORA = "Sem operadora"


def _num(v) -> float | None:
    return float(v) if v is not None else None


def _events(db: Session, start: datetime, end_excl: datetime) -> list[dict]:
    """Envios pra emissao no intervalo UTC [start, end_excl)."""
    rows = (
        db.query(LeadEmissao, Lead.name)
        .join(Lead, Lead.id == LeadEmissao.lead_id)
        .filter(LeadEmissao.enviado_em >= start, LeadEmissao.enviado_em < end_excl)
        .all()
    )
    events = [
        {
            "evento_id": str(r.id), "tipo": "linha",
            "lead_id": str(r.lead_id), "cliente": name or "Sem nome", "operadora": r.operadora,
            "valor": _num(r.valor if r.valor is not None else r.valor_cotacao),
            "operador": r.enviado_por or "—", "em": r.enviado_em, "observacao": r.observacao,
        }
        for r, name in rows
    ]

    hist = (
        db.query(LeadStatusHistory, Lead.name, Lead.value_potential)
        .join(Lead, Lead.id == LeadStatusHistory.lead_id)
        .filter(
            LeadStatusHistory.to_status == "emissao",
            LeadStatusHistory.changed_at >= start, LeadStatusHistory.changed_at < end_excl,
        )
        .all()
    )
    if hist:
        ids = {h.lead_id for h, _, _ in hist}
        cobertos = {
            (lid, em) for lid, em in
            db.query(LeadEmissao.lead_id, LeadEmissao.enviado_em).filter(LeadEmissao.lead_id.in_(ids)).all()
        }
        for h, name, valor in hist:
            if (h.lead_id, h.changed_at) in cobertos:
                continue  # ja' tem linha em lead_emissoes (mesmo instante) -- nao conta 2x
            events.append({
                "evento_id": str(h.id), "tipo": "historico",
                "lead_id": str(h.lead_id), "cliente": name or "Sem nome", "operadora": SEM_OPERADORA,
                "valor": _num(valor), "operador": h.changed_by or "—", "em": h.changed_at, "observacao": None,
            })
    return events


def _agg(events: list[dict], key: str) -> list[dict]:
    acc: dict = defaultdict(lambda: {"count": 0, "valor": 0.0})
    for e in events:
        acc[e[key]]["count"] += 1
        acc[e[key]]["valor"] += e["valor"] or 0.0
    return [
        {key: k, "count": v["count"], "valor": round(v["valor"], 2)}
        for k, v in sorted(acc.items(), key=lambda kv: (kv[1]["valor"], kv[1]["count"]), reverse=True)
    ]


@router.get("/resumo")
def resumo(
    date_from: str = Query(None, description="YYYY-MM-DD (padrao: hoje)"),
    date_to: str = Query(None, description="YYYY-MM-DD (padrao: date_from)"),
    operador: str = Query(None, description="filtra pelo nome de quem enviou"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = now_br().date()
    try:
        d_from = datetime.strptime(date_from, "%Y-%m-%d").date() if date_from else today
        d_to = datetime.strptime(date_to, "%Y-%m-%d").date() if date_to else d_from
    except ValueError:
        raise HTTPException(status_code=422, detail="Datas inválidas, use YYYY-MM-DD")
    if d_to < d_from:
        d_from, d_to = d_to, d_from

    start, _ = br_date_to_utc_range(d_from)
    _, end_excl = br_date_to_utc_range(d_to)
    n_days = (d_to - d_from).days + 1

    # perfil usuario so' enxerga os proprios envios; os demais, todos (ou o operador escolhido)
    own = current_user.first_name or current_user.username
    only = own if current_user.role == "usuario" else (operador.strip() if operador and operador.strip() else None)

    def scoped(evs: list[dict]) -> list[dict]:
        return [e for e in evs if e["operador"] == only] if only else evs

    events = scoped(_events(db, start, end_excl))
    prev_events = scoped(_events(db, start - timedelta(days=n_days), start))
    valor_total = round(sum(e["valor"] or 0.0 for e in events), 2)

    # serie: 7 dias corridos terminando em d_to
    s_start, _ = br_date_to_utc_range(d_to - timedelta(days=6))
    serie_events = scoped(_events(db, s_start, end_excl))
    por_dia: dict = defaultdict(int)
    for e in serie_events:
        por_dia[(e["em"] - BR_OFFSET).date()] += 1
    serie = [
        {"data": (d_to - timedelta(days=i)).isoformat(), "count": por_dia.get(d_to - timedelta(days=i), 0)}
        for i in range(6, -1, -1)
    ]

    # estoque: leads em Emissao agora, com quem enviou e ha quantos dias
    now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
    leads_em = db.query(Lead).filter(func.lower(Lead.status) == "emissao").all()
    estoque: list[dict] = []
    if leads_em:
        ids = [l.id for l in leads_em]
        ultima_linha: dict = {}
        for r in db.query(LeadEmissao).filter(LeadEmissao.lead_id.in_(ids)).order_by(LeadEmissao.enviado_em.asc()).all():
            ultima_linha[r.lead_id] = r
        ultima_entrada: dict = {}
        for h in (
            db.query(LeadStatusHistory)
            .filter(LeadStatusHistory.lead_id.in_(ids), LeadStatusHistory.to_status == "emissao")
            .order_by(LeadStatusHistory.changed_at.asc()).all()
        ):
            ultima_entrada[h.lead_id] = h
        for l in leads_em:
            r, h = ultima_linha.get(l.id), ultima_entrada.get(l.id)
            since = (r.enviado_em if r else None) or (h.changed_at if h else None) or l.updated_at or l.created_at
            valor = _num(r.valor if r and r.valor is not None else (r.valor_cotacao if r else l.value_potential))
            estoque.append({
                "lead_id": str(l.id), "cliente": l.name or "Sem nome",
                "operadora": r.operadora if r else SEM_OPERADORA,
                "operador": (r.enviado_por if r else (h.changed_by if h else None)) or "—",
                "valor": valor, "dias": max(0, (now_utc - since).days) if since else 0,
            })
    estoque = scoped(estoque)
    parados = sorted([e for e in estoque if e["dias"] > PARADO_DIAS], key=lambda e: e["dias"], reverse=True)

    return {
        "date_from": d_from.isoformat(), "date_to": d_to.isoformat(), "operador": only,
        "enviados": len(events), "valor_total": valor_total,
        "ticket_medio": round(valor_total / len(events), 2) if events else 0.0,
        "enviados_anterior": len(prev_events),
        "em_emissao": len(estoque), "em_emissao_valor": round(sum(e["valor"] or 0.0 for e in estoque), 2),
        "parados": parados,
        "parados_valor": round(sum(e["valor"] or 0.0 for e in parados), 2),
        "por_operadora": _agg(events, "operadora"),
        "por_operador": _agg(events, "operador"),
        "serie": serie,
        "contratos": [
            {**{k: v for k, v in e.items() if k != "em"}, "em": e["em"].isoformat()}
            for e in sorted(events, key=lambda e: e["em"])
        ],
    }


class DefinirOperadoraRequest(BaseModel):
    tipo: Literal["linha", "historico"]
    evento_id: str
    operadora: str
    valor: Optional[float] = None


@router.post("/definir-operadora")
def definir_operadora(
    body: DefinirOperadoraRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Define (ou corrige) a operadora de um envio pra emissao. Serve tambem pro que foi
    enviado antes da janela existir ("Sem operadora", tipo=historico) e pra lead que ja'
    saiu de Emissao -- onde reescolher "Emissao" na ficha mudaria o status. Nao conta
    envio novo: o registro criado leva a data e a pessoa da entrada real no status."""
    operadora = (body.operadora or "").strip()
    if operadora not in OPERADORAS_EMISSAO:
        raise HTTPException(status_code=422, detail="Selecione a operadora da emissão")
    try:
        evento_id = uuid.UUID(body.evento_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Envio inválido")

    own = current_user.first_name or current_user.username

    def _checa_dono(autor: str | None) -> None:
        # perfil usuario so' mexe nos proprios envios
        if current_user.role == "usuario" and (autor or "") != own:
            raise HTTPException(status_code=403, detail="Você só pode alterar os seus próprios envios")

    if body.tipo == "linha":
        row = db.query(LeadEmissao).filter(LeadEmissao.id == evento_id).first()
        if not row:
            raise HTTPException(status_code=404, detail="Envio não encontrado")
        _checa_dono(row.enviado_por)
    else:
        h = db.query(LeadStatusHistory).filter(LeadStatusHistory.id == evento_id, LeadStatusHistory.to_status == "emissao").first()
        if not h:
            raise HTTPException(status_code=404, detail="Envio não encontrado")
        _checa_dono(h.changed_by)
        row = db.query(LeadEmissao).filter(LeadEmissao.lead_id == h.lead_id, LeadEmissao.enviado_em == h.changed_at).first()
        if row is None:
            lead = db.query(Lead).filter(Lead.id == h.lead_id).first()
            if not lead:
                raise HTTPException(status_code=404, detail="Lead não encontrado")
            row = LeadEmissao(
                lead_id=h.lead_id, valor=lead.value_potential, valor_cotacao=lead.value_potential,
                enviado_por=h.changed_by, enviado_em=h.changed_at,
            )
            db.add(row)
    row.operadora = operadora
    if body.valor is not None:
        row.valor = body.valor
    db.commit()
    return {"success": True}
