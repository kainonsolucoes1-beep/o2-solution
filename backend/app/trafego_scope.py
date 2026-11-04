"""Perfil "trafego": parceiro externo (time que gerencia as campanhas da Meta)
que confere se os leads da campanha estão entrando no o2sig.

Regra única do que esse perfil enxerga -- usada pela rota dele
(parceiro_routes) e pelo filtro global de leads (database.py):
  - só leads da Meta Ads (campo Campanha = Meta ou origem Meta/Facebook/Instagram);
  - nunca Google (campanha ou origem Google);
  - nunca renutrição;
  - só os criados a partir de 04/11/2026 (horário de Brasília).
Fora isso o perfil é bloqueado por padrão: o middleware de main.py só deixa
ele chegar em /api/v1/parceiro/* e nas rotas de login/senha.
"""
from datetime import date

from sqlalchemy import and_, func, or_

from app.tz_utils import br_date_to_utc_range

TRAFEGO_ROLE = "trafego"
TRAFEGO_LEADS_DESDE = date(2026, 11, 4)
_DESDE_UTC = br_date_to_utc_range(TRAFEGO_LEADS_DESDE)[0]

META_ORIGENS = ("meta ads", "meta", "facebook", "facebook ads", "instagram", "instagram ads")

# rotas liberadas pro perfil, além de /api/v1/parceiro/*
TRAFEGO_ALLOWLIST = {
    "/api/v1/auth/login",
    "/api/v1/auth/me",
    "/api/v1/auth/change-password",
}
TRAFEGO_PREFIX = "/api/v1/parceiro/"

# Formulários da Meta conhecidos -> região da campanha (só rótulo na tela)
FORM_REGIAO = {
    "920887077776708": "SP",
    "2154020872683921": "MG",
}


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
