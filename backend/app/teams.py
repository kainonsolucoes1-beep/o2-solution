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
