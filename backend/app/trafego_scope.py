"""Perfil "trafego": parceiro externo (time que gerencia as campanhas da Meta)
que confere se os leads da campanha estão entrando no o2sig.

Regra única do que esse perfil enxerga -- usada pelo middleware (ficha do
lead, main.py) e pelo filtro global de leads (database.py):
  - só leads da Meta Ads (campo Campanha = Meta ou origem Meta/Facebook/Instagram);
  - nunca Google (campanha ou origem Google);
  - nunca renutrição;
  - só os criados a partir de 04/11/2026 (horário de Brasília).
Fora isso o perfil é bloqueado por padrão: o middleware de main.py só deixa
ele consultar o Relatório de leads e a ficha (só leitura).
"""
import re
from datetime import date

from sqlalchemy import and_, func, or_

from app.tz_utils import br_date_to_utc_range

TRAFEGO_ROLE = "trafego"
TRAFEGO_LEADS_DESDE = date(2026, 11, 4)
_DESDE_UTC = br_date_to_utc_range(TRAFEGO_LEADS_DESDE)[0]

META_ORIGENS = ("meta ads", "meta", "facebook", "facebook ads", "instagram", "instagram ads")

# O parceiro usa o mesmo o2sig (Relatório de leads e ficha), só consultando.
# Middleware (main.py) libera SÓ o que está aqui; qualquer outra rota, ou
# qualquer escrita, dá 403.
TRAFEGO_POST_LIVRE = {"/api/v1/auth/login", "/api/v1/auth/change-password"}
TRAFEGO_GET_LIVRE = {
    "/api/v1/auth/me",
    # Relatório de leads e listas dos filtros -- todas consultam Lead pelo
    # ORM, então o filtro global (database.py) já restringe ao escopo abaixo
    "/api/v1/leads/by-period",
    "/api/v1/leads/report-stats",
    "/api/v1/leads/campanhas-midia",
    "/api/v1/leads/conversion-points",
    "/api/v1/leads/lost-reasons",
    "/api/v1/leads/modalidades",
    "/api/v1/leads/origins",
    "/api/v1/leads/origins/split",
}
# ficha do lead: /leads/{id} e estas sub-rotas, desde que o lead esteja no escopo
# (checado no middleware -- notas/histórico não passam pelo filtro de Lead)
_LEAD_PATH = re.compile(r"^/api/v1/leads/([0-9a-fA-F-]{36})(?:/(notes|status-history|schedule-history|peek))?$")


def trafego_lead_id_da_rota(method: str, path: str) -> tuple[bool, str | None]:
    """(liberada?, lead_id a conferir). Só leitura, só rotas da lista."""
    if method == "POST" and path in TRAFEGO_POST_LIVRE:
        return True, None
    if method not in ("GET", "HEAD"):
        return False, None
    if path in TRAFEGO_GET_LIVRE:
        return True, None
    m = _LEAD_PATH.match(path)
    if m:
        return True, m.group(1)
    return False, None


def trafego_lead_criteria(cls):
    """Condição SQL sobre a entidade Lead (ou alias) do que o perfil pode ver.
    Sem variáveis de closure: o cache de lambda do with_loader_criteria
    (database.py) aceita globais de módulo como parâmetro."""
    campanha = func.lower(func.trim(func.coalesce(cls.campanha_midia, "")))
    origem = func.lower(func.trim(func.coalesce(cls.origin, "")))
    return and_(
        or_(campanha == "meta", origem.in_(META_ORIGENS)),
        campanha != "google",
        origem != "google",
        or_(cls.is_renutrucao.is_(None), cls.is_renutrucao.is_(False)),
        cls.renutricao_owner_id.is_(None),
        cls.created_at >= _DESDE_UTC,
    )
