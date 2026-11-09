TEAMS = [
    {"slug": "saopaulo", "name": "Equipe São Paulo", "seed_attendants": "Julia"},
    {"slug": "pernambuco", "name": "Equipe Pernambuco", "seed_attendants": "Breno"},
]

TEAM_BY_SLUG = {t["slug"]: t for t in TEAMS}

# Empresas (11/2026): equipes de cadastro de usuario, em paralelo as equipes
# de rodizio acima. Um lead e' da O2 Seguros quando o atendente dele e' um
# usuario cadastrado na O2 Seguros (ver security.company_scope e o filtro
# global em database.py). Nao sao gravadas em Lead.team.
COMPANY_SOLUTION = "O2 Solution"
COMPANY_SEGUROS = "O2 Seguros"
COMPANY_TEAMS = (COMPANY_SOLUTION, COMPANY_SEGUROS)


def team_key_setting(slug: str) -> str:
    return f"public_leads_team_key_{slug}"


def team_attendants_setting(slug: str) -> str:
    return f"public_leads_attendants_{slug}"


def team_rr_index_setting(slug: str) -> str:
    return f"public_leads_rr_index_{slug}"


# Atendente fixo (04/11/2026): enquanto esta chave tiver um nome, TODO lead novo
# do site/orgânico, Google e Meta Ads vai pra essa pessoa e o rodízio fica
# parado. Apagar o valor (ou a chave) volta o rodízio normal.
FIXED_ATTENDANT_SETTING = "leads_atendente_fixo"
FIXED_ATTENDANT_SEED = "Pamela"


def fixed_attendant(db):
    """Nome do atendente fixo, se configurado e ativo no cadastro. Usa a
    grafia do cadastro (first_name). Sem usuário ativo com esse nome, devolve
    None e o rodízio segue normal -- assim lead nenhum fica sem dono."""
    from app.models import User
    from app.models.app_settings import AppSettings

    row = db.query(AppSettings).filter(AppSettings.key == FIXED_ATTENDANT_SETTING).first()
    nome = (row.value or "").strip() if row else ""
    if not nome:
        return None
    u = (
        db.query(User)
        .filter(User.is_active.is_(True), User.role != "trafego")
        .filter(User.first_name.ilike(nome))
        .first()
    )
    return u.first_name.strip() if u and u.first_name else None


def team_attendant_names(db, team_slug: str, team_name: str) -> list:
    """Nomes elegiveis pro rodizio da equipe. Prioriza quem esta cadastrado
    com esse time em users (entra/sai sozinho conforme o cadastro muda); se
    ninguem estiver, cai pra lista manual em AppSettings (compatibilidade
    com equipes que ainda nao usam o campo team dos usuarios)."""
    from app.models import User
    from app.models.app_settings import AppSettings

    users = (
        db.query(User)
        # parceiro de tráfego (perfil externo) nunca entra no rodízio
        .filter(User.team == team_name, User.is_active.is_(True), User.role != "trafego")
        .order_by(User.created_at.asc())
        .all()
    )
    names = [u.first_name.strip() for u in users if u.first_name and u.first_name.strip()]
    if names:
        return names

    row = db.query(AppSettings).filter(AppSettings.key == team_attendants_setting(team_slug)).first()
    return [n.strip() for n in (row.value or "").split(",") if n.strip()] if row else []
