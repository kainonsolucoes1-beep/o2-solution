TEAMS = [
    {"slug": "saopaulo", "name": "Equipe São Paulo", "seed_attendants": "Julia"},
    {"slug": "pernambuco", "name": "Equipe Pernambuco", "seed_attendants": "Breno"},
]

TEAM_BY_SLUG = {t["slug"]: t for t in TEAMS}


def team_key_setting(slug: str) -> str:
    return f"public_leads_team_key_{slug}"


def team_attendants_setting(slug: str) -> str:
    return f"public_leads_attendants_{slug}"


def team_rr_index_setting(slug: str) -> str:
    return f"public_leads_rr_index_{slug}"


def team_attendant_names(db, team_slug: str, team_name: str) -> list:
    """Nomes elegiveis pro rodizio da equipe. Prioriza quem esta cadastrado
    com esse time em users (entra/sai sozinho conforme o cadastro muda); se
    ninguem estiver, cai pra lista manual em AppSettings (compatibilidade
    com equipes que ainda nao usam o campo team dos usuarios)."""
    from app.models import User
    from app.models.app_settings import AppSettings

    users = (
        db.query(User)
        .filter(User.team == team_name, User.is_active.is_(True))
        .order_by(User.created_at.asc())
        .all()
    )
    names = [u.first_name.strip() for u in users if u.first_name and u.first_name.strip()]
    if names:
        return names

    row = db.query(AppSettings).filter(AppSettings.key == team_attendants_setting(team_slug)).first()
    return [n.strip() for n in (row.value or "").split(",") if n.strip()] if row else []
