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


def _save_sync_status(ok: bool, counts: str = "", error: str = "") -> None:
    """Persiste resultado do último sync no banco para visibilidade no painel."""
    try:
        from app.models.app_settings import AppSettings
        db = SessionLocal()
        now = datetime.now(timezone.utc).isoformat()
        updates = [("last_sync_at", now), ("last_sync_ok", "1" if ok else "0")]
        if ok:
            updates += [("last_sync_counts", counts), ("last_sync_error", "")]
        else:
            updates.append(("last_sync_error", error))
        try:
            for key, value in updates:
                row = db.query(AppSettings).filter(AppSettings.key == key).first()
                if row:
                    row.value = value
                else:
                    db.add(AppSettings(key=key, value=value))
            db.commit()
        finally:
            db.close()
    except Exception as exc:
        logger.warning("Não foi possível salvar status do sync: %s", exc)


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
        _persist_tokens(_tokens["access"], _tokens["refresh"])
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


def _fetch_leads_page(page: int, date_from: str, date_of: str = "change") -> dict:
    """Faz GET /v3/leads na API Followize. date_from é obrigatório pela API."""
    headers = {
        "Authorization": f"Bearer {_tokens['access']}",
        "Accept": "application/json",
    }
    resp = requests.get(
        f"{FOLLOWIZE_API_URL}/v3/leads",
        headers=headers,
        params={"page": page, "date_from": date_from, "date_of": date_of},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def _fetch_all_leads(date_from: str, date_of: str = "change") -> list[dict]:
    """Busca todos os leads paginados via v3, renovando token em 401."""
    all_leads: list[dict] = []
    page = 1

    while True:
        try:
            data = _fetch_leads_page(page, date_from, date_of)
        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 401:
                logger.warning("Token expirado (401) — tentando renovar...")
                if not _refresh_access_token():
                    raise RuntimeError("Renovação de token falhou — sincronização abortada")
                data = _fetch_leads_page(page, date_from, date_of)  # uma tentativa após renovação
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
    followize_id = int(raw["id"]) if raw.get("id") else None

    # Busca pelo ID do Followize (fonte primária e imutável)
    existing = None
    if followize_id:
        existing = db.query(Lead).filter(Lead.followize_id == followize_id).first()

    # Fallback para leads antigos sem followize_id
    if not existing:
        if fields["email"]:
            existing = db.query(Lead).filter(Lead.email == fields["email"]).first()
        elif fields["phone"]:
            existing = db.query(Lead).filter(Lead.phone == fields["phone"], Lead.name == fields["name"]).first()
        elif fields["name"] and fields["name"] != "Sem nome":
            # Sem email e sem telefone: deduplicar por nome para evitar registros repetidos
            existing = (
                db.query(Lead)
                .filter(Lead.name == fields["name"], Lead.email.is_(None), Lead.phone.is_(None))
                .order_by(Lead.followize_id.desc().nullslast())
                .first()
            )

    if existing:
        existing.followize_id = followize_id
        existing.name = fields["name"]
        existing.phone = fields["phone"]
        existing.company = fields["company"]
        existing.status = fields["status"]
        existing.origin = fields["origin"]
        existing.attendant = fields["attendant"]
        existing.value_potential = fields["value_potential"]
        existing.perception = fields["perception"]
        if fields["created_at"]:
            existing.created_at = fields["created_at"]
        existing.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
        return "updated"

    lead_kwargs = dict(
        user_id=user_id, followize_id=followize_id,
        name=fields["name"], email=fields["email"], phone=fields["phone"],
        company=fields["company"], origin=fields["origin"], attendant=fields["attendant"],
        status=fields["status"], value_potential=fields["value_potential"],
        perception=fields["perception"],
    )
    if fields["created_at"]:
        lead_kwargs["created_at"] = fields["created_at"]

    db.add(Lead(**lead_kwargs))
    return "inserted"


async def sync_leads_from_followize() -> None:
    """Sincroniza leads do Followize para o PostgreSQL."""
    _load_tokens_from_db()
    if not _tokens["access"]:
        logger.error("FOLLOWIZE_ACCESS_TOKEN não configurado — sync ignorado")
        return

    # Busca por criação (novos leads) + por alteração (percepção/status atualizados)
    date_from_1d = _date_from_lookback(days=1)
    date_from_2d = _date_from_lookback(days=2)
    logger.info("Iniciando sincronização Followize (creation=%s, change=%s)...", date_from_1d, date_from_2d)

    try:
        created, changed = await asyncio.gather(
            asyncio.to_thread(_fetch_all_leads, date_from_1d, "creation"),
            asyncio.to_thread(_fetch_all_leads, date_from_2d, "change"),
        )
    except Exception as exc:
        logger.error("Erro ao buscar leads do Followize: %s", exc)
        _save_sync_status(False, error=str(exc))
        return

    # Deduplica por ID (change tem prioridade por ter dados mais recentes)
    seen: dict[str, dict] = {}
    for raw in created:
        seen[str(raw.get("id"))] = raw
    for raw in changed:
        seen[str(raw.get("id"))] = raw
    raw_leads = list(seen.values())

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
        counts = f"{inserted} inseridos, {updated} atualizados"
        _save_sync_status(True, counts=counts)
        logger.info(
            "Followize sync concluído: %d leads (%d inseridos, %d atualizados)",
            inserted + updated,
            inserted,
            updated,
        )
    except Exception as exc:
        db.rollback()
        _save_sync_status(False, error=f"Erro ao salvar no banco: {exc}")
        logger.exception("Erro ao salvar leads no banco: %s", exc)
    finally:
        db.close()


def update_tokens_in_memory(access: str, refresh: str) -> None:
    _tokens["access"] = access
    _tokens["refresh"] = refresh


async def start_sync_scheduler() -> None:
    """Loop infinito: sincroniza Followize a cada 5 minutos."""
    while True:
        try:
            await sync_leads_from_followize()
        except Exception as exc:
            logger.error("Erro inesperado no scheduler — continuando em 5 min: %s", exc)
            _save_sync_status(False, error=f"Erro inesperado no scheduler: {exc}")
        await asyncio.sleep(300)


async def start_token_refresh_scheduler() -> None:
    """Renova proativamente o token Followize a cada 10 horas.

    O access_token expira em 18h. Renovando a cada 10h garantimos
    que nunca chegamos perto do limite, mesmo após um restart do container.
    """
    await asyncio.sleep(600)  # aguarda 10 min antes do primeiro refresh para não conflitar com startup
    while True:
        try:
            _load_tokens_from_db()
            ok = await asyncio.to_thread(_refresh_access_token)
            if ok:
                logger.info("Token Followize renovado proativamente com sucesso")
            else:
                logger.error("Falha na renovação proativa do token — refresh token pode ter expirado")
                _save_sync_status(False, error="Falha na renovação proativa do token — acesse Configurações e atualize os tokens manualmente")
        except Exception as exc:
            logger.error("Erro inesperado na renovação proativa do token: %s", exc)
        await asyncio.sleep(36000)  # 10 horas
