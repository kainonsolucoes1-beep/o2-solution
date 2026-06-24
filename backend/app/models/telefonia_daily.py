import uuid
from sqlalchemy import Column, Integer, Date, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from app.database import Base


class TelefoniaDaily(Base):
    __tablename__ = "telefonia_daily"

    id                = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date              = Column(Date, unique=True, nullable=False)
    total_ligacoes    = Column(Integer, nullable=False, default=0)
    ligacoes_json     = Column(Text, nullable=False, default="{}")
    atendimentos_json = Column(Text, nullable=False, default="{}")
    tma               = Column(Text, nullable=False, default="—")
    created_at        = Column(TIMESTAMP, server_default=func.now())
    updated_at        = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())
