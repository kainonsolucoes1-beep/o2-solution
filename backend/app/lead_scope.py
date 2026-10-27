from sqlalchemy import and_, or_

from app.models import Lead
from app.tz_utils import br_date_to_utc_range


def own_leads_clause(user):
    """"Leads da pessoa" pra quem só enxerga a própria carteira
    (needs_own_origin_filter): origem = nome dela ou dona da renutrição. No
    perfil usuario, também o lead novo do rodízio em que ela é a atendente --
    sem dono (renutrição/lote/transferência seguem a regra do dono) e criado
    depois da contratação (ou da criação da conta), mesma ideia da Vida do
    Agente (agent_leads_clause). Usado pela Gestão Comercial e pelo Relatório
    aberto a partir dela, pra os números baterem."""
    nome = user.first_name or user.username
    clause = or_(Lead.origin == nome, Lead.renutricao_owner_id == user.id)
    if user.role == "usuario":
        inicio = br_date_to_utc_range(user.hire_date)[0] if user.hire_date else user.created_at
        if inicio:
            clause = or_(clause, and_(
                Lead.attendant == nome,
                Lead.renutricao_owner_id.is_(None),
                Lead.created_at >= inicio,
            ))
    return clause
