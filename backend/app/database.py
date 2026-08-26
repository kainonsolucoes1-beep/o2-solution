from sqlalchemy import and_, create_engine, event, func, or_, select
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, with_loader_criteria
import os

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@event.listens_for(SessionLocal, "do_orm_execute")
def _apply_lead_visibility_filter(orm_execute_state):
    """Filtro global: leads com visibility_tag='ADM', origin='ADM' OU
    conversion_point='ADM' ficam invisiveis (em qualquer query ORM —
    listagens, KPIs, agregados) para quem nao tem um dos perfis autorizados.
    Ligado por request em get_current_user, via
    session.info['restrict_admin_leads']."""
    if orm_execute_state.session.info.get("restrict_admin_leads"):
        from app.models.lead import Lead  # import tardio: evita import circular com Base

        def _not_adm(col):
            return or_(col.is_(None), func.upper(func.trim(col)) != "ADM")

        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(
                Lead,
                lambda cls: and_(_not_adm(cls.visibility_tag), _not_adm(cls.origin), _not_adm(cls.conversion_point)),
                include_aliases=True,
            )
        )

    restrict_team = orm_execute_state.session.info.get("restrict_team")
    if restrict_team:
        from app.models.lead import Lead

        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(
                Lead,
                lambda cls: cls.team == restrict_team,
                include_aliases=True,
            )
        )

    if orm_execute_state.session.info.get("restrict_to_usuario_leads"):
        from app.models.lead import Lead
        from app.models.user import User
        from app.lead_utils import ORGANICO_EXTRA

        # Lead.user_id NAO identifica o vendedor real: tanto o sync do
        # Followize quanto o endpoint publico do Gravity Forms gravam ali
        # uma conta fixa/arbitraria, sem relacao com quem trabalhou o lead.
        # Quem carrega o nome do vendedor de fato e' Lead.origin -- entao
        # a visibilidade do perfil comercial precisa comparar por origin
        # contra o nome das contas 'usuario', nao por user_id. Inclui
        # tambem o proprio nome do comercial, pra nao esconder leads que
        # ja eram dele de antes da troca de perfil (ex: ex-SDR promovido).
        own_name = orm_execute_state.session.info.get("own_origin_name")

        def _comercial_visible(cls):
            conds = [
                cls.origin.in_(select(func.coalesce(User.first_name, User.username)).where(User.role == "usuario")),
                func.lower(cls.origin).like("%org%"),
                func.lower(cls.origin).in_(ORGANICO_EXTRA),
                func.lower(cls.conversion_point) == "chatgpt.com",
            ]
            if own_name:
                conds.append(cls.origin == own_name)
            return or_(*conds)

        orm_execute_state.statement = orm_execute_state.statement.options(
            with_loader_criteria(Lead, _comercial_visible, include_aliases=True)
        )