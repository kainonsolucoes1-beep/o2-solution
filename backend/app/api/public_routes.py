import hmac
import json
import logging
import re
import time
import uuid
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.notificacoes_routes import notificar_novo_lead
from app.models import Lead, LeadNote, LeadSinalPendente, User
from app.models.app_settings import AppSettings
from app.teams import TEAMS, team_key_setting, team_rr_index_setting, team_attendant_names
from app.lead_utils import normalize_current_plan as _normalize_current_plan

from app.duplicidade import lead_parecido, marcar_duplicado

router = APIRouter(prefix="/api/v1/public", tags=["public"])
logger = logging.getLogger(__name__)

_RATE_LIMIT_WINDOW = 60
_RATE_LIMIT_MAX = 30  # por IP e por minuto; integrações (Meta Ads, Make...) mandam em rajada
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
    current_plan: Optional[str] = None
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
    # rastreio de campanha paga (todos opcionais)
    campanha: Optional[str] = None  # campo "Campanha" da ficha: Google, Meta...
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_term: Optional[str] = None
    utm_content: Optional[str] = None
    fbclid: Optional[str] = None
    gclid: Optional[str] = None
    # id do lead no sistema de quem envia: reenviar o mesmo id não cria outro
    # lead (protege contra reenvio por erro de rede/timeout)
    id_externo: Optional[str] = None


# Sinônimos de modalidade usados por integrações externas (ex: Make.com) que
# devem cair na mesma opção já existente no funil, em vez de criar uma nova.
_MODALIDADE_ALIASES = {"individual": "PF"}


def _normalize_modalidade(modalidade: Optional[str]) -> Optional[str]:
    if not modalidade:
        return modalidade
    return _MODALIDADE_ALIASES.get(modalidade.strip().lower(), modalidade)


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


_FAIXAS_MARKER = "Quantidade de Vidas por Faixa"


def _build_notes(body: "PublicLeadCreate") -> Optional[str]:
    """Monta as observacoes do lead: mensagem livre (se houver) + o bloco
    'Campos customizados' no mesmo formato usado pelos leads antigos do
    Followize (ex: '24-28 anos: 1'). Se a mensagem ja traz o resumo das
    faixas (plugin Gravity Forms >= 1.1.5 monta isso), nao repete o bloco."""
    parts = []
    if body.message and body.message.strip():
        parts.append(body.message.strip())
    if body.message and _FAIXAS_MARKER in body.message:
        return parts[0]
    faixas_lines = [f"{label}: {getattr(body, field)}" for field, label in _FAIXA_LABELS if getattr(body, field)]
    if faixas_lines:
        parts.append("Campos customizados:\n" + "\n".join(faixas_lines))
    return "\n\n".join(parts) if parts else None


def _next_attendant(db: Session, team_slug: str, team_name: str) -> Optional[str]:
    """Roda a fila de atendentes (round-robin) da equipe. A lista de nomes vem
    de quem esta cadastrado com esse time (se ninguem, cai pra lista manual em
    AppSettings). O indice do rodizio em si fica bloqueado (FOR UPDATE) pra
    evitar corrida entre leads simultaneos pegando a mesma posicao."""
    names = team_attendant_names(db, team_slug, team_name)
    if not names:
        return None

    rr_key = team_rr_index_setting(team_slug)
    index_row = (
        db.query(AppSettings)
        .filter(AppSettings.key == rr_key)
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
        db.add(AppSettings(key=rr_key, value=next_index))
    return attendant


def _match_team(db: Session, x_team_key: str) -> Optional[dict]:
    """Compara a chave de equipe recebida contra a chave de cada equipe
    cadastrada, em tempo constante. Retorna o dict da equipe casada, ou None."""
    for team in TEAMS:
        row = db.query(AppSettings).filter(AppSettings.key == team_key_setting(team["slug"])).first()
        if row and row.value and hmac.compare_digest(x_team_key, row.value):
            return team
    return None


_SINAL_JANELA = timedelta(minutes=30)
_CLICK_ID_RE = re.compile(r"^[A-Za-z0-9_\-]{10,250}$")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _marcar_google_ads(db: Session, lead: Lead, click_id: str) -> None:
    """Campanha = Google (se ninguém marcou outra) e guarda o click id do anúncio."""
    if not lead.campanha_midia:
        lead.campanha_midia = "Google"
    if not lead.gclid:
        lead.gclid = click_id
    db.add(LeadNote(lead_id=lead.id, user_id=None, content="Veio de um clique no anúncio do Google Ads (aviso da tag do site). Campanha: Google."))


@router.post("/lead-sinal", status_code=204)
async def lead_sinal(request: Request, db: Session = Depends(get_db)):
    """Aviso da tag do GTM no envio do formulário do site: "este lead clicou
    num anúncio do Google Ads". Vem do navegador via sendBeacon (text/plain,
    sem chave -- uma chave no GTM ficaria pública). Por isso só faz uma coisa:
    marca Campanha = Google em lead do mesmo site criado há menos de 30 min,
    casando por telefone ou e-mail. Se o lead ainda não chegou, guarda o aviso
    e o /public/leads aplica quando ele entrar. Responde 204 sempre que o
    corpo é válido (não revela se o lead existe)."""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)
    try:
        data = json.loads((await request.body())[:4000] or b"{}")
    except ValueError:
        raise HTTPException(status_code=400, detail="JSON inválido")
    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="JSON inválido")

    host = str(data.get("host") or "").strip().lower()[:255]
    phone = re.sub(r"\D", "", str(data.get("phone") or ""))[:20]
    email = str(data.get("email") or "").strip().lower()[:255]
    click_id = None
    for key in ("gclid", "gbraid", "wbraid"):
        v = str(data.get(key) or "").strip()
        if v and _CLICK_ID_RE.match(v):
            click_id = v if key == "gclid" else f"{key}:{v}"
            break
    if not host or not click_id or (len(phone) < 10 and "@" not in email):
        raise HTTPException(status_code=400, detail="Aviso incompleto")

    agora = _utcnow()
    db.query(LeadSinalPendente).filter(LeadSinalPendente.created_at < agora - timedelta(hours=1)).delete()

    conds = []
    if len(phone) >= 10:
        conds.append(func.regexp_replace(Lead.phone, r"\D", "", "g") == phone)
    if "@" in email:
        conds.append(func.lower(Lead.email) == email)
    lead = (
        db.query(Lead)
        .filter(
            or_(*conds),
            func.lower(func.trim(Lead.conversion_point)) == host,
            Lead.created_at >= agora - _SINAL_JANELA,
        )
        .order_by(Lead.created_at.desc())
        .first()
    )
    if lead:
        if not lead.gclid:  # gclid já gravado = aviso repetido, não duplica a nota
            _marcar_google_ads(db, lead, click_id)
    else:
        db.add(LeadSinalPendente(host=host, phone_digits=phone if len(phone) >= 10 else None, email=email if "@" in email else None, click_id=click_id))
    db.commit()


def _autenticar(db: Session, request: Request, x_api_key: str, x_team_key: str) -> dict:
    """Valida a chave da conta (X-API-Key) e a da equipe (X-Team-Key), com
    limite de requisições por IP. Retorna o dict da equipe casada."""
    ip = request.client.host if request.client else "unknown"
    _check_rate_limit(ip)

    expected = db.query(AppSettings).filter(AppSettings.key == "public_leads_api_key").first()
    if not expected or not expected.value or not hmac.compare_digest(x_api_key, expected.value):
        logger.warning("Tentativa de chave de conta inválida em %s — ip=%s key_prefix=%s", request.url.path, ip, x_api_key[:6])
        raise HTTPException(status_code=403, detail="Chave da conta inválida")

    team = _match_team(db, x_team_key)
    if not team:
        logger.warning("Tentativa de chave de equipe inválida em %s — ip=%s key_prefix=%s", request.url.path, ip, x_team_key[:6])
        raise HTTPException(status_code=403, detail="Chave da equipe inválida")
    return team


# Rótulos dos status pra quem consulta o lead de fora (GET /public/leads/{id})
_STATUS_PUBLICO = {
    "novo": "Novo", "pending": "Novo", "qualificado": "Agendado", "scheduled": "Agendado",
    "aguardando_dados": "Aguardando dados", "sem_retorno": "Sem retorno",
    "proposta": "Proposta", "proposal_sent": "Proposta enviada", "negociacao": "Em negociação",
    "pendencia": "Pendência", "documentacao_pendente": "Documentação pendente", "emissao": "Emissão",
    "waiting_billing": "Aguardando faturamento", "sale_performed": "Venda realizada",
    "won": "Ganho", "fechado": "Fechado", "closed": "Fechado", "convertido": "Convertido",
    "sale_not_performed": "Cancelado",
}


def _corta(v: Optional[str], n: int) -> Optional[str]:
    v = (v or "").strip()
    return v[:n] if v else None


@router.get("/ping")
def ping_public(
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_team_key: str = Header(..., alias="X-Team-Key"),
):
    """Testa as credenciais sem criar nada: 200 com a equipe se as chaves
    estiverem certas, 403 se não."""
    team = _autenticar(db, request, x_api_key, x_team_key)
    return {"success": True, "equipe": team["name"]}


@router.get("/leads/{lead_id}")
def get_public_lead(
    lead_id: str,
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_team_key: str = Header(..., alias="X-Team-Key"),
):
    """Consulta um lead pelo lead_id devolvido no POST. Só enxerga leads da
    equipe da chave e devolve só o básico (status e datas), nada da ficha."""
    team = _autenticar(db, request, x_api_key, x_team_key)
    try:
        lead_uuid = uuid.UUID(lead_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    lead = db.query(Lead).filter(Lead.id == lead_uuid, Lead.team == team["name"]).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    status = (lead.status or "").lower()
    return {
        "lead_id": str(lead.id),
        "name": lead.name,
        "status": status,
        "status_label": _STATUS_PUBLICO.get(status, lead.status or ""),
        "origin": lead.origin,
        "campanha": lead.campanha_midia,
        "equipe": lead.team,
        "created_at": lead.created_at.isoformat() + "Z" if lead.created_at else None,
    }


@router.post("/leads", status_code=201)
def create_public_lead(
    body: PublicLeadCreate,
    request: Request,
    db: Session = Depends(get_db),
    x_api_key: str = Header(..., alias="X-API-Key"),
    x_team_key: str = Header(..., alias="X-Team-Key"),
):
    team = _autenticar(db, request, x_api_key, x_team_key)

    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Nome é obrigatório")
    if not body.phone or not body.phone.strip():
        raise HTTPException(status_code=422, detail="Telefone é obrigatório")

    # Repetido não é mais recusado (04/11/2026): entra marcado como possível
    # duplicado do lead que já tinha o e-mail/telefone. Só o reenvio do mesmo
    # id_externo é ignorado -- devolve o lead que já foi criado.
    id_externo = _corta(body.id_externo, 100)
    if id_externo:
        ja = db.query(Lead.id).filter(Lead.external_id == id_externo, Lead.team == team["name"]).first()
        if ja:
            return JSONResponse(status_code=200, content={"success": True, "lead_id": str(ja.id), "ja_recebido": True})
    original = lead_parecido(body.email, body.phone)

    default_user = db.query(User).first()
    attendant = _next_attendant(db, team["slug"], team["name"])
    lead = Lead(
        name=name,
        email=body.email,
        phone=body.phone,
        company=body.company,
        notes=_build_notes(body),
        origin=body.origin or "Orgânico",
        conversion_point=body.conversion_point,
        modalidade=_normalize_modalidade(body.modalidade),
        current_plan=_normalize_current_plan(body.current_plan),
        attendant=attendant,
        team=team["name"],
        status="novo",
        user_id=default_user.id if default_user else None,
        campanha_midia=_corta(body.campanha, 50),
        tracking_campaign=_corta(body.utm_campaign, 255),
        tracking_medium=_corta(body.utm_medium, 255),
        tracking_term=_corta(body.utm_term, 255),
        tracking_format=_corta(body.utm_content, 255),
        fbclid=_corta(body.fbclid, 255),
        gclid=_corta(body.gclid, 255),
        external_id=id_externo,
    )
    db.add(lead)
    db.flush()
    if original:
        marcar_duplicado(db, lead, original)
    # aviso da tag do GTM que chegou antes do lead (clique no Google Ads)
    _phone = re.sub(r"\D", "", body.phone or "")
    _email = (body.email or "").strip().lower()
    _conds = [LeadSinalPendente.phone_digits == _phone] if len(_phone) >= 10 else []
    if _email:
        _conds.append(LeadSinalPendente.email == _email)
    if _conds and lead.conversion_point:
        sinal = (
            db.query(LeadSinalPendente)
            .filter(
                or_(*_conds),
                func.lower(LeadSinalPendente.host) == lead.conversion_point.strip().lower(),
                LeadSinalPendente.created_at >= _utcnow() - _SINAL_JANELA,
            )
            .order_by(LeadSinalPendente.created_at.desc())
            .first()
        )
        if sinal:
            _marcar_google_ads(db, lead, sinal.click_id)
            db.delete(sinal)
    # Lead.notes nao aparece na ficha (so a linha do tempo, que le LeadNote) --
    # espelha as observacoes (mensagem + idades) como nota pra ficarem visiveis
    # (sem autor: aparece como "Sistema", nao com o nome de um usuario real).
    if lead.notes:
        db.add(LeadNote(lead_id=lead.id, user_id=None, content=lead.notes))
    notificar_novo_lead(db, lead)
    db.commit()
    db.refresh(lead)
    return {"success": True, "lead_id": str(lead.id)}
