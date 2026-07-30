from sqlalchemy import and_, create_engine, event, func, or_
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
    """Filtro global: leads com visibility_tag='ADM' OU origin='ADM' ficam
    invisiveis (em qualquer query ORM — listagens, KPIs, agregados) para quem
    nao tem um dos perfis autorizados. Ligado por request em get_current_user,
    via session.info['restrict_admin_leads']."""
    if not orm_execute_state.session.info.get("restrict_admin_leads"):
        return
    from app.models.lead import Lead  # import tardio: evita import circular com Base

    def _not_adm(col):
        return or_(col.is_(None), func.upper(func.trim(col)) != "ADM")

    orm_execute_state.statement = orm_execute_state.statement.options(
        with_loader_criteria(
            Lead,
            lambda cls: and_(_not_adm(cls.visibility_tag), _not_adm(cls.origin)),
            include_aliases=True,
        )
    )