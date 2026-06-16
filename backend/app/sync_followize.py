import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Lead, User

logger = logging.getLogger(__name__)

FOLLOWIZE_API_URL = os.getenv("FOLLOWIZE_API_URL", "https://api.followize.com.br")

# In-memory tokens — refreshed in-place on 401
_tokens: dict[str, str | None] = {
    "access": os.getenv("FOLLOWIZE_ACCESS_TOKEN"),
    "refresh": os.getenv("FOLLOWIZE_REFRESH_TOKEN"),
}


def _persist_tokens(access: str, refresh: str) -> None:
    """Salva tokens no banco (fonte primária) e no .env.production (fallback)."""
    # Banco
    try:
        from app.models.app_settings import AppSettings
        db = SessionLocal()
        try:
            for key, value in [("followize_access_token", access), ("followize_refresh_token", refresh)]:
                row = db.query(AppSettings).filter(AppSettings.key == key).first()
                if row:
                    row.value = value
                else:
                    db.add(AppSettings(key=key, value=value))
            db.commit()
            logger.info("Tokens Followize persistidos no banco")
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Não foi possível salvar tokens no banco: %s", exc)

    # .env.production (fallback legado)
    try:
        import re
        env_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".env.production"))
        if os.path.exists(env_path):
            with open(env_path, "r") as f:
                content = f.read()
            content = re.sub(r"FOLLOWIZE_ACCESS_TOKEN=.*", f"FOLLOWIZE_ACCESS_TOKEN={access}", content)
            content = re.sub(r"FOLLOWIZE_REFRESH_TOKEN=.*", f"FOLLOWIZE_REFRESH_TOKEN={refresh}", content)
            with open(env_path, "w") as f:
                f.write(content)
    except Exception as exc:
        logger.warning("Não foi possível atualizar .env.production: %s", exc)


def _load_tokens_from_db() -> None:
    """Carrega tokens frescos do banco antes de cada sync."""
    try:
        from app.models.app_settings import AppSettings
        db = SessionLocal()
        try:
            for db_key, mem_key in [("followize_access_token", "access"), ("followize_refresh_token", "refresh")]:
                row = db.query(AppSettings).filter(AppSettings.key == db_key).first()
                if row and row.value:
                    _tokens[mem_key] = row.value
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Não foi possível carregar tokens do banco: %s", exc)


def _refresh_access_token() -> bool:
    refresh = _tokens["refresh"]
    if not refresh:
        logger.error("FOLLOWIZE_REFRESH_TOKEN não configurado — não é possível renovar")
        return False

    try:
        resp = requests.post(
            f"{FOLLOWIZE_API_URL}/oauth/token",
            json={"grant_type": "refresh_token", "refresh_token": refresh},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
        _tokens["access"] = data["access_token"]
        _tokens["refresh"] = data.get("refresh_token", refresh)
        _persist_tokens_to_env(_tokens["access"], _tokens["refresh"])
        logger.info("Token Followize renovado com sucesso")
        return True
    except Exception as exc:
        logger.error("Falha ao renovar token Followize: %s", exc)
        return False


def _parse_followize_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    for fmt in (
        "%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S.%f+00:00", "%Y-%m-%dT%H:%M:%S+00:00",
    ):
        try:
            return datetime.strptime(s, fmt) - timedelta(hours=3)
        except ValueError:
            continue
    return None


def _date_from_lookback(days: int = 1) -> str:
    """Retorna date_from como 'YYYY-MM-DD' (hoje menos N dias)."""
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


def _fetch_leads_page(page: int, date_from: str) -> dict:
    """Faz GET /v3/leads na API Followize. date_from é obrigatório pela API."""
    headers = {
        "Authorization": f"Bearer {_tokens['access']}",
        "Accept": "application/json",
    }
    resp = requests.get(
        f"{FOLLOWIZE_API_URL}/v3/leads",
        headers=headers,
        params={"page": page, "date_from": date_from},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_all_leads(date_from: str) -> list[dict]:
    """Busca todos os leads paginados via v3, renovando token em 401."""
    all_leads: list[dict] = []
    page = 1

    while True:
        try:
            data = _fetch_leads_page(page, date_from)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                logger.warning("Token expirado (401) — tentando renovar...")
                if not _refresh_access_token():
                    raise RuntimeError("Renovação de token falhou — sincronização abortada")
                data = _fetch_leads_page(page, date_from)  # uma tentativa após renovação
            else:
                raise

        # v3 response: {data: [...], links: {next: url|null}, meta: {...}}
        leads = data.get("data") or []
        meta = data.get("meta") or {}
        if not leads:
            break

        all_leads.extend(leads)
        logger.debug(
            "Página %d/%d — %d leads acumulados",
            meta.get("current_page", page),
            meta.get("last_page", "?"),
            len(all_leads),
        )

        links = data.get("links") or {}
        if not links.get("next"):
            break
        page += 1

    return all_leads


def _parse_lead_fields(raw: dict) -> dict:
    contact: dict = raw.get("contact") or {}
    company_obj = contact.get("company")
    company_obj = company_obj if isinstance(company_obj, dict) else {}

    name = (
        raw.get("name")
        or contact.get("name")
        or contact.get("full_name")
        or "Sem nome"
    )
    email = contact.get("email") or raw.get("email")
    phone = contact.get("cellphone") or contact.get("phone") or raw.get("phone")
    company = company_obj.get("name") or contact.get("company_name") or raw.get("company")
    status = raw.get("status") or "novo"
    attendant = (
        ((contact.get("attendant") or {}).get("name"))
        or ((raw.get("attendant") or {}).get("name"))
        or "Sem atendente"
    )
    origin = (raw.get("tracking") or {}).get("source") or "Sem origem"
    created_at = _parse_followize_dt(raw.get("created_at"))
    last_proposal = raw.get("last_proposal") or {}
    finalization = raw.get("finalization") or {}
    value_potential = float(last_proposal.get("amount") or finalization.get("amount") or 0.0)
    _perception_map = {"hot": "Quente", "warm": "Morno", "cold": "Frio"}
    perception = _perception_map.get(raw.get("perception") or "", None)

    return {"name": name, "email": email, "phone": phone, "company": company, "status": status, "attendant": attendant, "origin": origin, "created_at": created_at, "value_potential": value_potential, "perception": perception}


def _upsert_lead(db: Session, raw: dict, user_id) -> str:
    """Insere ou atualiza um lead. Retorna 'inserted' ou 'updated'."""
    fields = _parse_lead_fields(raw)
    email = fields["email"]
    name = fields["name"]
    phone = fields["phone"]
    company = fields["company"]
    status = fields["status"]
    attendant = fields["attendant"]
    origin = fields["origin"]
    created_at = fields["created_at"]
    value_potential = fields["value_potential"]
    perception = fields["perception"]

    if email:
        existing = db.query(Lead).filter(Lead.email == email).first()
    elif phone:
        existing = db.query(Lead).filter(Lead.phone == phone, Lead.name == name).first()
    else:
        existing = None

    if existing:
        existing.name = name
        existing.phone = phone
        existing.company = company
        existing.status = status
        existing.origin = origin
        existing.attendant = attendant
        existing.value_potential = value_potential
        existing.perception = perception
        if created_at:
            existing.created_at = created_at
        existing.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return "updated"

    lead_kwargs = dict(
        user_id=user_id, name=name, email=email, phone=phone,
        company=company, origin=origin, attendant=attendant, status=status,
        value_potential=value_potential, perception=perception,
    )
    if created_at:
        lead_kwargs["created_at"] = created_at

    db.add(Lead(**lead_kwargs))
    return "inserted"


async def sync_leads_from_followize() -> None:
    """Sincroniza leads do Followize para o PostgreSQL."""
    if not _tokens["access"]:
        logger.error("FOLLOWIZE_ACCESS_TOKEN não configurado — sync ignorado")
        return

    # Busca leads criados/atualizados desde ontem (cobre a janela de 30 min com margem)
    date_from = _date_from_lookback(days=1)
    logger.info("Iniciando sincronização Followize (date_from=%s)...", date_from)

    try:
        raw_leads = await asyncio.to_thread(_fetch_all_leads, date_from)
    except Exception as exc:
        logger.error("Erro ao buscar leads do Followize: %s", exc)
        return

    if not raw_leads:
        logger.info("Followize não retornou nenhum lead")
        return

    db: Session = SessionLocal()
    try:
        default_user = db.query(User).first()
        if not default_user:
            logger.error("Nenhum usuário encontrado no banco — sync abortado")
            return

        inserted = updated = 0
        for raw in raw_leads:
            result = _upsert_lead(db, raw, default_user.id)
            if result == "inserted":
                inserted += 1
            else:
                updated += 1

        db.commit()
        logger.info(
            "Followize sync concluído: %d leads (%d inseridos, %d atualizados)",
            inserted + updated,
            inserted,
            updated,
        )
    except Exception as exc:
        db.rollback()
        logger.exception("Erro ao salvar leads no banco: %s", exc)
    finally:
        db.close()


async def start_sync_scheduler() -> None:
    """Loop infinito: sincroniza Followize a cada 30 minutos."""
    while True:
        await sync_leads_from_followize()
        await asyncio.sleep(1800)
