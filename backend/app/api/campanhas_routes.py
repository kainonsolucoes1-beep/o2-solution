from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import List, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Date, cast, func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.api.leads_routes import _is_admin
from app.database import get_db
from app.models import Lead, LeadNote, CampanhaEvento, User
from app.tz_utils import BR_OFFSET, br_date_to_utc_range

router = APIRouter(prefix="/api/v1/campanhas", tags=["campanhas"])

Canal = Literal["whatsapp", "email", "sms"]
CANAL_LABEL = {"whatsapp": "WhatsApp", "email": "e-mail", "sms": "SMS"}
CANAIS: tuple[Canal, ...] = ("whatsapp", "email", "sms")
FILA_ATIVA = ("fila", "disparado_sem_resposta")
DISPARO_ACOES = ("disparado_sem_resposta", "respondeu")

# rodízio fixo, nesta ordem, contador simples e global (guardado em AppSettings)
RODIZIO_NOMES = ["Pamela", "Isaac", "Julia"]


def _find_user_by_name(db: Session, nome: str) -> User | None:
    return (
        db.query(User)
        .filter(or_(func.lower(User.first_name) == nome.lower(), func.lower(User.username) == nome.lower()))
        .first()
    )


def _operador_campanha(db: Session) -> User:
    """Quem faz o disparo — marcado com a flag is_campanha_operador em
    Configurações → Usuários, em vez de um nome fixo ("Isaac"). Assim
    funciona em qualquer ambiente (staging pode ter uma conta de teste
    diferente da de produção) e sobrevive a troca de pessoa sem deploy."""
    user = db.query(User).filter(User.is_campanha_operador.is_(True)).first()
    if not user:
        raise HTTPException(
            status_code=500,
            detail="Nenhum usuário marcado como operador de Campanhas — marque um em Configurações → Usuários.",
        )
    return user


def _pode_trabalhar_fila(current_user: User, operador: User) -> bool:
    return current_user.id == operador.id or _is_admin(current_user)


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
    operador = _operador_campanha(db)
    admin_label = current_user.first_name or current_user.username

    leads = db.query(Lead).filter(Lead.id.in_(body.lead_ids)).all()
    for lead in leads:
        lead.renutricao_owner_id = operador.id
        lead.is_renutrucao = True
        lead.attendant = operador.first_name or operador.username
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
    operador = _operador_campanha(db)
    if not _pode_trabalhar_fila(current_user, operador):
        raise HTTPException(status_code=403, detail="Apenas Isaac ou administradores podem ver a fila de campanhas")
    rows = (
        db.query(Lead.campanha_canal, func.count(Lead.id))
        .filter(Lead.renutricao_owner_id == operador.id, Lead.campanha_status.in_(FILA_ATIVA))
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
    operador = _operador_campanha(db)
    if not _pode_trabalhar_fila(current_user, operador):
        raise HTTPException(status_code=403, detail="Apenas Isaac ou administradores podem ver a fila de campanhas")
    leads = (
        db.query(Lead)
        .filter(Lead.renutricao_owner_id == operador.id, Lead.campanha_canal == canal, Lead.campanha_status.in_(FILA_ATIVA))
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
    operador = _operador_campanha(db)
    if not _pode_trabalhar_fila(current_user, operador):
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


@router.get("/dashboard")
def campanhas_dashboard(
    date_from: str = Query(...),
    date_to: str = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Métricas de Campanhas — disparo, resposta e rodízio no período. Não é
    o Dashboard geral: mede o disparo do Isaac, não a captação/venda."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Apenas administradores podem ver o dashboard de Campanhas")
    try:
        start, _ = br_date_to_utc_range(date_from)
        _, end = br_date_to_utc_range(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")

    # Na fila: estado ATUAL, independe do período escolhido.
    fila_rows = (
        db.query(Lead.campanha_canal, func.count(Lead.id))
        .filter(Lead.campanha_status.in_(FILA_ATIVA))
        .group_by(Lead.campanha_canal)
        .all()
    )
    na_fila_por_canal = {c: 0 for c in CANAIS}
    for canal, n in fila_rows:
        if canal in na_fila_por_canal:
            na_fila_por_canal[canal] = n

    # Disparos e respostas do período, por canal.
    canal_rows = (
        db.query(CampanhaEvento.canal, CampanhaEvento.acao, func.count(CampanhaEvento.id))
        .filter(CampanhaEvento.criado_em >= start, CampanhaEvento.criado_em < end, CampanhaEvento.acao.in_(DISPARO_ACOES))
        .group_by(CampanhaEvento.canal, CampanhaEvento.acao)
        .all()
    )
    disparos_por_canal = {c: 0 for c in CANAIS}
    respostas_por_canal = {c: 0 for c in CANAIS}
    for canal, acao, n in canal_rows:
        if canal not in disparos_por_canal:
            continue
        disparos_por_canal[canal] += n
        if acao == "respondeu":
            respostas_por_canal[canal] += n

    disparos = sum(disparos_por_canal.values())
    respostas = sum(respostas_por_canal.values())
    taxa_resposta = round(respostas / disparos * 100, 1) if disparos else 0.0
    canais_detalhe = [
        {
            "canal": c,
            "na_fila": na_fila_por_canal[c],
            "disparado": disparos_por_canal[c],
            "respondeu": respostas_por_canal[c],
            "taxa": round(respostas_por_canal[c] / disparos_por_canal[c] * 100, 1) if disparos_por_canal[c] else 0.0,
        }
        for c in CANAIS
    ]

    # Ritmo diário — 14 dias terminando no fim do período (data local BR).
    fim_date = (end - timedelta(microseconds=1)).date()
    ritmo_ini_date = fim_date - timedelta(days=13)
    ritmo_ini_dt, _ = br_date_to_utc_range(ritmo_ini_date.isoformat())
    dia_expr = cast(CampanhaEvento.criado_em - BR_OFFSET, Date)
    ritmo_rows = (
        db.query(dia_expr.label("dia"), CampanhaEvento.canal, func.count(CampanhaEvento.id))
        .filter(CampanhaEvento.criado_em >= ritmo_ini_dt, CampanhaEvento.criado_em < end, CampanhaEvento.acao.in_(DISPARO_ACOES))
        .group_by(dia_expr, CampanhaEvento.canal)
        .all()
    )
    ritmo_map: dict = defaultdict(lambda: {"whatsapp": 0, "email": 0, "sms": 0})
    for dia, canal, n in ritmo_rows:
        if canal in CANAIS:
            ritmo_map[dia.isoformat()][canal] = n
    ritmo_diario = []
    for i in range(14):
        dia_str = (ritmo_ini_date + timedelta(days=i)).isoformat()
        ritmo_diario.append({"dia": dia_str, **ritmo_map.get(dia_str, {"whatsapp": 0, "email": 0, "sms": 0})})

    # Rodízio do período: quem recebeu quantos leads distribuídos.
    rodizio_rows = (
        db.query(CampanhaEvento.distribuido_para_user_id, func.count(CampanhaEvento.id))
        .filter(
            CampanhaEvento.criado_em >= start, CampanhaEvento.criado_em < end,
            CampanhaEvento.acao == "respondeu", CampanhaEvento.distribuido_para_user_id.isnot(None),
        )
        .group_by(CampanhaEvento.distribuido_para_user_id)
        .all()
    )
    rodizio = []
    if rodizio_rows:
        users_map = {u.id: (u.first_name or u.username) for u in db.query(User).filter(User.id.in_([uid for uid, _ in rodizio_rows])).all()}
        rodizio = sorted(
            ({"nome": users_map.get(uid, "?"), "count": n} for uid, n in rodizio_rows),
            key=lambda r: r["count"], reverse=True,
        )

    # Atividade recente (log direto da campanha_eventos) — só o desfecho mais
    # recente por lead. Um mesmo lead pode gerar "disparado_sem_resposta" e,
    # minutos depois, "respondeu" (o Isaac marca os dois); mostrar as duas
    # linhas polui a lista sem agregar nada — o histórico completo continua
    # em campanha_eventos e na ficha do lead, só a lista fica enxuta.
    recentes_raw = (
        db.query(CampanhaEvento, Lead.name)
        .join(Lead, Lead.id == CampanhaEvento.lead_id)
        .filter(CampanhaEvento.criado_em >= start, CampanhaEvento.criado_em < end)
        .order_by(CampanhaEvento.criado_em.desc())
        .limit(200)
        .all()
    )
    vistos: set = set()
    recentes = []
    for ev, lead_nome in recentes_raw:
        if ev.lead_id in vistos:
            continue
        vistos.add(ev.lead_id)
        recentes.append((ev, lead_nome))
        if len(recentes) >= 30:
            break
    envolvidos = {ev.por_user_id for ev, _ in recentes if ev.por_user_id} | {ev.distribuido_para_user_id for ev, _ in recentes if ev.distribuido_para_user_id}
    nomes = {u.id: (u.first_name or u.username) for u in db.query(User).filter(User.id.in_(envolvidos)).all()} if envolvidos else {}
    atividade_recente = [
        {
            "lead_nome": lead_nome,
            "canal": ev.canal,
            "acao": ev.acao,
            "por": nomes.get(ev.por_user_id),
            "distribuido_para": nomes.get(ev.distribuido_para_user_id),
            "em": ev.criado_em.isoformat() if ev.criado_em else None,
        }
        for ev, lead_nome in recentes
    ]

    return {
        "na_fila": sum(na_fila_por_canal.values()),
        "disparos": disparos,
        "respostas": respostas,
        "taxa_resposta": taxa_resposta,
        "distribuidos": respostas,
        "canais": canais_detalhe,
        "ritmo_diario": ritmo_diario,
        "rodizio": rodizio,
        "atividade_recente": atividade_recente,
    }
