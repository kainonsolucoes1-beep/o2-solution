import hashlib
import hmac
import json
import logging
from typing import Optional

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Lead, User
from app.models.app_settings import AppSettings
from app.teams import TEAM_BY_SLUG, team_rr_index_setting, team_attendant_names

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
    """Mesma logica de round-robin usada em public_routes.py."""
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


def _process_leadgen(db: Session, leadgen_id: str, form_name: Optional[str]):
    page_access_token = _setting(db, "meta_page_access_token")
    if not page_access_token:
        logger.error("meta_page_access_token não configurado — não foi possível buscar leadgen_id=%s", leadgen_id)
        return

    try:
        fields = _fetch_lead_fields(leadgen_id, page_access_token)
    except requests.RequestException:
        logger.exception("Falha ao buscar dados do lead na Graph API — leadgen_id=%s", leadgen_id)
        return

    # DEBUG TEMPORARIO: só os nomes das chaves, sem valor, pra identificar o
    # campo do plano de saude. Remover depois de mapear o campo certo.
    logger.info("DEBUG campos do lead recebidos: %s", list(fields.keys()))

    name = (fields.get("full_name") or fields.get("first_name") or "Lead Meta Ads").strip()
    email = fields.get("email")
    phone = fields.get("phone_number")

    existing = None
    if email:
        existing = db.query(Lead).filter(Lead.email == email).first()
    if not existing and phone:
        existing = db.query(Lead).filter(Lead.phone == phone, Lead.name == name).first()
    if existing:
        logger.info("Lead do Meta já existe (leadgen_id=%s) — ignorando duplicata", leadgen_id)
        return

    team = TEAM_BY_SLUG[META_LEADS_TEAM_SLUG]
    default_user = db.query(User).first()
    attendant = _next_attendant(db, team["slug"], team["name"])

    lead = Lead(
        name=name,
        email=email,
        phone=phone,
        origin="Meta Ads",
        conversion_point=form_name,
        attendant=attendant,
        team=team["name"],
        status="novo",
        user_id=default_user.id if default_user else None,
    )
    db.add(lead)
    db.commit()
    logger.info("Lead criado a partir do webhook Meta — leadgen_id=%s lead_id=%s", leadgen_id, lead.id)


@router.post("/meta-leads", status_code=200)
async def receive_meta_lead(request: Request, db: Session = Depends(get_db)):
    raw_body = await request.body()

    app_secret = _setting(db, "meta_app_secret")
    signature = request.headers.get("X-Hub-Signature-256", "")
    if app_secret:
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
            form_name = value.get("form_name") or value.get("form_id")
            if leadgen_id:
                _process_leadgen(db, str(leadgen_id), form_name)

    # A Meta so exige 200 rapido; processamos sincrono pq o volume e baixo.
    return {"success": True}
