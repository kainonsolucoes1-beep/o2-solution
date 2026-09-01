"""Regras de acesso pros perfis internos (frente 1 do plano de endurecimento).

1b — janela de horário: perfis internos só acessam em dias úteis, das 9h às 16h
(horário de Brasília), exceto feriado nacional. Liga/desliga por um interruptor
em AppSettings (`acesso_janela_ativa`), desligado por padrão.
"""
from datetime import datetime

from fastapi import HTTPException

from app.br_calendar import br_holidays
from app.tz_utils import now_br

# perfis presos às regras de horário e dispositivo. admin/diretor ficam livres.
RESTRICTED_ROLES = {"usuario", "comercial", "supervisor"}

JANELA_INICIO = 9   # hora (inclusive)
JANELA_FIM = 16     # hora (exclusive — 16:00 em ponto já bloqueia)

_MSG_JANELA = f"Acesso liberado apenas em dias úteis, das {JANELA_INICIO}h às {JANELA_FIM}h."


def _flag_ativa(db, key: str) -> bool:
    from app.models.app_settings import AppSettings
    row = db.query(AppSettings).filter(AppSettings.key == key).first()
    return bool(row and row.value == "1")


def dentro_da_janela(now: datetime | None = None) -> bool:
    now = now or now_br()
    return (
        now.weekday() < 5
        and now.date() not in br_holidays(now.year)
        and JANELA_INICIO <= now.hour < JANELA_FIM
    )


def check_time_window(user, db) -> None:
    """Levanta 403 se o usuário está fora da janela de horário permitida."""
    if user.role not in RESTRICTED_ROLES:
        return
    if getattr(user, "horario_estendido", False):
        return
    if not _flag_ativa(db, "acesso_janela_ativa"):
        return
    if not dentro_da_janela():
        raise HTTPException(status_code=403, detail={"code": "fora_janela", "message": _MSG_JANELA})
