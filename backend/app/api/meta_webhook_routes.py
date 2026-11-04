import hashlib
import re
import hmac
import json
import logging
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.api.notificacoes_routes import notificar_novo_lead
from app.models import Lead, LeadNote, User
from app.models.app_settings import AppSettings
from app.teams import TEAM_BY_SLUG, team_rr_index_setting, team_attendant_names, fixed_attendant
from app.lead_utils import normalize_current_plan, META_FORMULARIOS, parse_vidas, parse_idades
from app.duplicidade import lead_parecido, marcar_duplicado
from sqlalchemy.exc import IntegrityError

router = APIRouter(prefix="/api/v1/webhooks", tags=["meta-webhook"])
logger = logging.getLogger(__name__)

GRAPH_API_VERSION = "v21.0"

# Toda lead que chegar pelo webhook do Meta (Instagram/Facebook Ads) cai
# nesta equipe, seguindo a mesma fila de round-robin do formulario publico.
META_LEADS_TEAM_SLUG = "saopaulo"


def _setting(db: Session, key: str) -> Optional[str]:
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return row.value if row and row.value else None


def _next_attendant(db: Session, team_slug: str, team_name: str) -> Optional[str]:
    """Mesma logica de round-robin usada em public_routes.py (inclusive o
    atendente fixo, que passa por cima do rodizio)."""
    fixo = fixed_attendant(db)
    if fixo:
        return fixo
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


@router.get("/meta-leads")
def verify_meta_webhook(request: Request, db: Session = Depends(get_db)):
    """Handshake de verificacao exigido pela Meta ao salvar a URL de callback."""
    mode = request.query_params.get("hub.mode")
    token = request.query_params.get("hub.verify_token")
    challenge = request.query_params.get("hub.challenge", "")

    expected = _setting(db, "meta_webhook_verify_token")
    if mode == "subscribe" and expected and token and hmac.compare_digest(token, expected):
        return PlainTextResponse(challenge)

    logger.warning("Verificacao do webhook Meta falhou — mode=%s", mode)
    raise HTTPException(status_code=403, detail="Verificação inválida")


def _fetch_lead_fields(leadgen_id: str, page_access_token: str) -> dict:
    resp = requests.get(
        f"https://graph.facebook.com/{GRAPH_API_VERSION}/{leadgen_id}",
        params={"access_token": page_access_token},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    fields = {}
    for item in data.get("field_data", []):
        name = item.get("name")
        values = item.get("values") or []
        if name:
            fields[name] = values[0] if values else None
    return fields


def _clean_meta_choice(raw: Optional[str]) -> Optional[str]:
    """Respostas de multipla escolha do formulario vem tipo
    "❌_não_tenho_plano_de_saúde" — tira o emoji/simbolo do inicio e troca
    underscore por espaco, pra comparar com texto normal."""
    if not raw:
        return None
    text = re.sub(r'^[^\w]+', '', raw, flags=re.UNICODE).replace('_', ' ').strip()
    return text or None


# Cada formulário da Meta pode dar o nome que quiser às perguntas (o padrão é
# full_name / phone_number / email, mas formulários com pergunta personalizada
# mandam ex. "nome_completo", "whatsapp"). Procura primeiro os nomes exatos e
# depois qualquer campo que contenha a palavra.
_NOME_EXATO = ("full_name", "nome_completo", "nome", "name", "seu_nome", "qual_o_seu_nome?")
_NOME_PARTE = ("nome", "name")
_NOME_EXCLUI = ("empresa", "company", "plano", "operadora", "cidade", "user", "razao", "razão", "fantasia")
_TEL_EXATO = ("phone_number", "telefone", "celular", "whatsapp", "phone")
_TEL_PARTE = ("phone", "telefone", "celular", "whatsapp", "fone", "contato")
_EMAIL_PARTE = ("email", "e-mail", "e_mail")


def _achar_campo(fields: dict, exatos: tuple, partes: tuple, exclui: tuple = ()) -> Optional[str]:
    for k in exatos:
        v = (fields.get(k) or "").strip()
        if v:
            return v
    for k, v in fields.items():
        kl = (k or "").lower()
        if any(p in kl for p in partes) and not any(x in kl for x in exclui) and (v or "").strip():
            return v.strip()
    return None


def _nome_do_lead(fields: dict) -> Optional[str]:
    # nomes exatos > nome + sobrenome separados > qualquer campo com "nome"
    nome = _achar_campo(fields, _NOME_EXATO, ())
    if nome:
        return nome
    junto = " ".join(x for x in ((fields.get("first_name") or "").strip(), (fields.get("last_name") or "").strip()) if x)
    return junto or _achar_campo(fields, (), _NOME_PARTE, _NOME_EXCLUI)


def _nota_respostas(fields: dict) -> Optional[str]:
    """Todas as respostas do formulário, legíveis, pra nada se perder na ficha
    (e pra ver o nome exato de cada campo quando for ajustar o mapeamento)."""
    linhas = []
    for k, v in fields.items():
        rotulo = (k or "").replace("_", " ").strip().rstrip("?").strip()
        valor = _clean_meta_choice(v) if v else None
        linhas.append(f"• {rotulo[:1].upper() + rotulo[1:]}: {valor or '—'}  [campo: {k}]")
    return ("Respostas do formulário Meta:\n" + "\n".join(linhas)) if linhas else None


def _modalidade_meta(fields: dict) -> Optional[str]:
    """"Possui CNPJ ou MEI?" respondido Sim -> PME. Qualquer outra resposta
    deixa a modalidade em branco pra atendente decidir."""
    resp = _achar_campo(fields, (), ("cnpj", "mei"))
    resp = (_clean_meta_choice(resp) or "").strip().lower() if resp else ""
    return "PME" if resp.startswith("sim") or resp in ("yes", "s") else None


def _process_leadgen(db: Session, leadgen_id: str, form_name: Optional[str]):
    # a Meta reenvia o mesmo aviso quando não recebe resposta a tempo -- o
    # mesmo leadgen_id é o mesmo lead, então ignora (o índice único em
    # leads.meta_leadgen_id segura também dois avisos chegando juntos)
    if db.query(Lead.id).filter(Lead.meta_leadgen_id == leadgen_id).first():
        logger.info("Lead do Meta já recebido (leadgen_id=%s) — reenvio ignorado", leadgen_id)
        return

    page_access_token = _setting(db, "meta_page_access_token")
    if not page_access_token:
        logger.error("meta_page_access_token não configurado — não foi possível buscar leadgen_id=%s", leadgen_id)
        return

    try:
        fields = _fetch_lead_fields(leadgen_id, page_access_token)
    except requests.RequestException:
        logger.exception("Falha ao buscar dados do lead na Graph API — leadgen_id=%s", leadgen_id)
        return

    name = _nome_do_lead(fields) or "Lead Meta Ads"
    email = _achar_campo(fields, ("email",), _EMAIL_PARTE)
    phone = _achar_campo(fields, _TEL_EXATO, _TEL_PARTE)
    logger.info("Lead do Meta leadgen_id=%s — campos recebidos: %s", leadgen_id, list(fields.keys()))
    # O formulario pergunta primeiro se a pessoa tem plano; quando a resposta
    # e "nao tenho", o campo com o nome do plano fica escondido mas a Meta
    # ainda manda um valor residual nele (ex: "outro") — por isso a resposta
    # da primeira pergunta manda: só olha o nome do plano quando ela indicar
    # que a pessoa tem plano. As respostas de multipla escolha vem com
    # emoji/underscore (ex: "❌_não_tenho_plano_de_saúde"), entao limpa antes
    # de comparar.
    has_plan_answer = _clean_meta_choice(fields.get("em_qual_opção_melhor_se_encaixa?"))
    if normalize_current_plan(has_plan_answer) == "Não possui plano":
        current_plan = "Não possui plano"
    else:
        plan_name = _clean_meta_choice(fields.get("qual_o_seu_plano_de_saúde_atual?"))
        current_plan = normalize_current_plan(plan_name) or normalize_current_plan(has_plan_answer)

    modalidade = _modalidade_meta(fields)
    vidas = parse_vidas(_achar_campo(fields, (), ("vidas", "quantas_pessoas")))
    idades = parse_idades(_achar_campo(fields, (), ("idade",)))

    # mesma pessoa (e-mail/telefone) já cadastrada: entra mesmo assim, marcado
    # como possível duplicado do lead anterior (app/duplicidade.py)
    original = lead_parecido(email, phone)

    team = TEAM_BY_SLUG[META_LEADS_TEAM_SLUG]
    default_user = db.query(User).first()
    attendant = _next_attendant(db, team["slug"], team["name"])

    lead = Lead(
        name=name,
        email=email,
        phone=phone,
        origin="Meta Ads",
        conversion_point=form_name,
        current_plan=current_plan,
        modalidade=modalidade,
        vidas=vidas,
        ages_raw=idades,
        attendant=attendant,
        team=team["name"],
        status="novo",
        user_id=default_user.id if default_user else None,
        meta_leadgen_id=leadgen_id,
    )
    db.add(lead)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        logger.info("Lead do Meta já recebido (leadgen_id=%s) — aviso simultâneo ignorado", leadgen_id)
        return
    nota = _nota_respostas(fields)
    if nota:
        db.add(LeadNote(lead_id=lead.id, user_id=None, content=nota))
    if original:
        marcar_duplicado(db, lead, original)
    notificar_novo_lead(db, lead)
    db.commit()
    logger.info("Lead criado a partir do webhook Meta — leadgen_id=%s lead_id=%s", leadgen_id, lead.id)


@router.post("/meta-leads", status_code=200)
async def receive_meta_lead(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()

    app_secret = _setting(db, "meta_app_secret")
    if not app_secret:
        # sem segredo configurado nao da pra verificar a assinatura -- recusa
        # em vez de aceitar qualquer payload sem checagem nenhuma
        logger.error("meta_app_secret não configurado — recusando webhook do Meta")
        raise HTTPException(status_code=503, detail="Webhook não configurado")
    signature = request.headers.get("X-Hub-Signature-256", "")
    expected_sig = "sha256=" + hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected_sig, signature):
        logger.warning("Assinatura inválida no webhook Meta")
        raise HTTPException(status_code=403, detail="Assinatura inválida")

    try:
        payload = json.loads(raw_body or b"{}")
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Payload inválido")

    for entry in payload.get("entry", []):
        for change in entry.get("changes", []):
            if change.get("field") != "leadgen":
                continue
            value = change.get("value", {})
            leadgen_id = value.get("leadgen_id")
            form_id = str(value.get("form_id") or "")
            form_name = META_FORMULARIOS.get(form_id) or value.get("form_name") or form_id or None
            if leadgen_id:
                _process_leadgen(db, str(leadgen_id), form_name)

    # A Meta so exige 200 rapido; processamos sincrono pq o volume e baixo.
    return {"success": True}
