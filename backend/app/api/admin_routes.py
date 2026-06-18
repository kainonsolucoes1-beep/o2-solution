import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.models import User
from app.models.app_settings import AppSettings
from app.sync_followize import update_tokens_in_memory, _fetch_all_leads, _upsert_lead, _date_from_lookback, _load_tokens_from_db, _save_sync_status
from app.models import Lead

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


def _require_admin(user: User):
    if user.role != "admin" and user.username != "lucas@o2solution.com.br":
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")


class TokenUpdateRequest(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/followize-tokens")
def update_followize_tokens(
    body: TokenUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)

    for key, value in [
        ("followize_access_token", body.access_token),
        ("followize_refresh_token", body.refresh_token),
    ]:
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))

    db.commit()
    update_tokens_in_memory(body.access_token, body.refresh_token)

    return {"success": True}


@router.get("/sync-status")
def sync_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    from app.models.app_settings import AppSettings
    keys = ["last_sync_at", "last_sync_ok", "last_sync_counts", "last_sync_error",
            "followize_access_token", "followize_refresh_token"]
    rows = {r.key: r.value for r in db.query(AppSettings).filter(AppSettings.key.in_(keys)).all()}
    return {
        "last_sync_at": rows.get("last_sync_at"),
        "last_sync_ok": rows.get("last_sync_ok") == "1",
        "last_sync_counts": rows.get("last_sync_counts", ""),
        "last_sync_error": rows.get("last_sync_error", ""),
        "tokens_configured": bool(rows.get("followize_access_token") and rows.get("followize_refresh_token")),
    }


@router.post("/deduplicate-leads")
def deduplicate_leads(
    dry_run: bool = Query(True, description="True = apenas conta, False = remove os duplicados"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Remove leads duplicados mantendo o mais recente de cada grupo."""
    _require_admin(current_user)
    from sqlalchemy import text

    # IDs a deletar: para cada email duplicado, manter o com followize_id mais alto
    # (ou o updated_at mais recente se não tiver followize_id)
    # Duplicados por email — manter o com followize_id mais alto (ou mais recente)
    find_email_dupes = text("""
        SELECT id FROM leads
        WHERE email IS NOT NULL AND email != ''
          AND id NOT IN (
            SELECT DISTINCT ON (email) id FROM leads
            WHERE email IS NOT NULL AND email != ''
            ORDER BY email, followize_id DESC NULLS LAST, updated_at DESC NULLS LAST
          )
    """)

    # Duplicados por phone+name (sem email) — manter o mais recente
    find_phone_dupes = text("""
        SELECT id FROM leads
        WHERE (email IS NULL OR email = '')
          AND phone IS NOT NULL AND phone != ''
          AND id NOT IN (
            SELECT DISTINCT ON (phone, name) id FROM leads
            WHERE (email IS NULL OR email = '') AND phone IS NOT NULL AND phone != ''
            ORDER BY phone, name, followize_id DESC NULLS LAST, updated_at DESC NULLS LAST
          )
    """)

    # Duplicados por name apenas (sem email e sem phone) — manter o com followize_id mais alto
    find_name_dupes = text("""
        SELECT id FROM leads
        WHERE (email IS NULL OR email = '')
          AND (phone IS NULL OR phone = '')
          AND name != 'Sem nome'
          AND id NOT IN (
            SELECT DISTINCT ON (name) id FROM leads
            WHERE (email IS NULL OR email = '') AND (phone IS NULL OR phone = '') AND name != 'Sem nome'
            ORDER BY name, followize_id DESC NULLS LAST, updated_at DESC NULLS LAST
          )
    """)

    email_dupe_ids = [str(r[0]) for r in db.execute(find_email_dupes).fetchall()]
    phone_dupe_ids = [str(r[0]) for r in db.execute(find_phone_dupes).fetchall()]
    name_dupe_ids  = [str(r[0]) for r in db.execute(find_name_dupes).fetchall()]
    all_dupe_ids = list(set(email_dupe_ids + phone_dupe_ids + name_dupe_ids))

    if dry_run:
        return {
            "dry_run": True,
            "duplicates_by_email": len(email_dupe_ids),
            "duplicates_by_phone_name": len(phone_dupe_ids),
            "duplicates_by_name_only": len(name_dupe_ids),
            "total_to_remove": len(all_dupe_ids),
        }

    if not all_dupe_ids:
        return {"dry_run": False, "removed": 0}

    import uuid as _uuid
    uuid_ids = [_uuid.UUID(i) for i in all_dupe_ids]
    db.query(Lead).filter(Lead.id.in_(uuid_ids)).delete(synchronize_session=False)
    db.commit()

    return {
        "dry_run": False,
        "removed": len(all_dupe_ids),
        "removed_by_email": len(email_dupe_ids),
        "removed_by_phone_name": len(phone_dupe_ids),
        "removed_by_name_only": len(name_dupe_ids),
    }


@router.get("/distinct-statuses")
def distinct_statuses(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(current_user)
    from sqlalchemy import func as sqlfunc
    rows = (
        db.query(Lead.status, sqlfunc.count(Lead.id).label("count"))
        .group_by(Lead.status)
        .order_by(sqlfunc.count(Lead.id).desc())
        .all()
    )
    return [{"status": r.status, "count": r.count} for r in rows]


@router.post("/sync-historico")
async def sync_historico(
    days: int = Query(default=90, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reprocessa leads alterados nos últimos N dias para popular percepção/status."""
    _require_admin(current_user)
    _load_tokens_from_db()
    date_from = _date_from_lookback(days=days)

    try:
        raw_leads = await asyncio.to_thread(_fetch_all_leads, date_from, "change")
    except Exception as exc:
        _save_sync_status(False, error=f"Reprocessamento falhou: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))

    if not raw_leads:
        _save_sync_status(True, counts="0 inseridos, 0 atualizados")
        return {"success": True, "date_from": date_from, "processed": 0}

    from app.models import User as UserModel
    default_user = db.query(UserModel).first()
    if not default_user:
        raise HTTPException(status_code=500, detail="Nenhum usuário no banco")

    inserted = updated = 0
    for raw in raw_leads:
        result = _upsert_lead(db, raw, default_user.id)
        if result == "inserted":
            inserted += 1
        else:
            updated += 1
    db.commit()

    _save_sync_status(True, counts=f"{inserted} inseridos, {updated} atualizados")
    return {"success": True, "date_from": date_from, "inserted": inserted, "updated": updated}
