import json
from datetime import date, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.database import get_db
from app.models.app_settings import AppSettings
from app.models.telefonia_daily import TelefoniaDaily
from app.api.auth_routes import get_current_user
from app.models.user import User

router = APIRouter(prefix="/api/v1/telefonia", tags=["telefonia"])


class TelefoniaSettings(BaseModel):
    ligacoes: dict[str, int] = {}
    atendimentos: dict[str, str] = {}
    pausas: dict[str, str] = {}


def _calc_tma(ligacoes: dict, atendimentos: dict) -> str:
    total_seconds = 0
    total_calls = 0
    for name, calls in ligacoes.items():
        t = atendimentos.get(name, "")
        if not t or calls <= 0:
            continue
        parts = t.strip().split(":")
        if len(parts) != 3:
            continue
        try:
            secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
            total_seconds += secs
            total_calls += calls
        except ValueError:
            continue
    if total_calls == 0:
        return "—"
    avg = total_seconds / total_calls
    mins = int(avg) // 60
    secs = int(avg) % 60
    return f"{mins}m {secs:02d}s" if mins > 0 else f"{secs}s"


@router.get("/settings")
def get_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = {
        r.key: r.value
        for r in db.query(AppSettings).filter(
            AppSettings.key.in_(["telefonia_ligacoes", "telefonia_atendimentos", "telefonia_pausas"])
        ).all()
    }
    ligacoes     = json.loads(rows["telefonia_ligacoes"])     if rows.get("telefonia_ligacoes")     else {}
    atendimentos = json.loads(rows["telefonia_atendimentos"]) if rows.get("telefonia_atendimentos") else {}
    pausas       = json.loads(rows["telefonia_pausas"])       if rows.get("telefonia_pausas")       else {}
    return {
        "tma":         _calc_tma(ligacoes, atendimentos),
        "ligacoes":    ligacoes,
        "atendimentos": atendimentos,
        "pausas":      pausas,
    }


@router.put("/settings")
def save_settings(
    body: TelefoniaSettings,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pairs = [
        ("telefonia_ligacoes",     json.dumps(body.ligacoes,     ensure_ascii=False)),
        ("telefonia_atendimentos", json.dumps(body.atendimentos, ensure_ascii=False)),
        ("telefonia_pausas",       json.dumps(body.pausas,       ensure_ascii=False)),
    ]
    for key, value in pairs:
        row = db.query(AppSettings).filter(AppSettings.key == key).first()
        if row:
            row.value = value
        else:
            db.add(AppSettings(key=key, value=value))
    # Snapshot diário
    total = sum(body.ligacoes.values())
    tma   = _calc_tma(body.ligacoes, body.atendimentos)
    today = date.today()
    daily = db.query(TelefoniaDaily).filter(TelefoniaDaily.date == today).first()
    if daily:
        daily.total_ligacoes    = total
        daily.ligacoes_json     = json.dumps(body.ligacoes,     ensure_ascii=False)
        daily.atendimentos_json = json.dumps(body.atendimentos, ensure_ascii=False)
        daily.pausas_json       = json.dumps(body.pausas,       ensure_ascii=False)
        daily.tma               = tma
    else:
        db.add(TelefoniaDaily(
            date=today,
            total_ligacoes=total,
            ligacoes_json=json.dumps(body.ligacoes,         ensure_ascii=False),
            atendimentos_json=json.dumps(body.atendimentos, ensure_ascii=False),
            pausas_json=json.dumps(body.pausas,             ensure_ascii=False),
            tma=tma,
        ))
    db.commit()
    return {"success": True}


def _tma_individual(calls: int, atendimento: str) -> str:
    if not atendimento or calls <= 0:
        return "—"
    parts = atendimento.strip().split(":")
    if len(parts) != 3:
        return "—"
    try:
        secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except ValueError:
        return "—"
    if secs <= 0:
        return "—"
    avg = secs / calls
    m, s = int(avg) // 60, int(avg) % 60
    return f"{m}m {s:02d}s" if m > 0 else f"{s}s"


@router.get("/historico")
def historico(
    days: int = Query(14, ge=1, le=90),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from_date = date.today() - timedelta(days=days - 1)
    records = (
        db.query(TelefoniaDaily)
        .filter(TelefoniaDaily.date >= from_date)
        .order_by(TelefoniaDaily.date.desc())
        .all()
    )
    result = []
    for r in records:
        ligacoes     = json.loads(r.ligacoes_json     or "{}")
        atendimentos = json.loads(r.atendimentos_json or "{}")
        pausas       = json.loads(r.pausas_json       or "{}")
        operadores = [
            {
                "nome":           nome,
                "ligacoes":       calls,
                "tma_individual": _tma_individual(calls, atendimentos.get(nome, "")),
                "pausa":          pausas.get(nome, ""),
            }
            for nome, calls in sorted(ligacoes.items(), key=lambda x: x[1], reverse=True)
        ]
        result.append({
            "date":           r.date.isoformat(),
            "total_ligacoes": r.total_ligacoes,
            "tma":            r.tma or "—",
            "operadores":     operadores,
        })
    return result


@router.get("/atendimentos-comparativo")
def atendimentos_comparativo(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today     = date.today()
    yesterday = today - timedelta(days=1)
    hoje      = db.query(TelefoniaDaily).filter(TelefoniaDaily.date == today).first()
    ontem     = db.query(TelefoniaDaily).filter(TelefoniaDaily.date == yesterday).first()
    total_hoje  = hoje.total_ligacoes  if hoje  else 0
    total_ontem = ontem.total_ligacoes if ontem else None
    diff = None
    if total_ontem is not None and total_ontem > 0:
        diff = round((total_hoje - total_ontem) / total_ontem * 100, 1)
    return {
        "hoje":  total_hoje,
        "ontem": total_ontem,
        "diff":  diff,
    }
