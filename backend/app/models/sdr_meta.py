from sqlalchemy import Column, String, Numeric, TIMESTAMP, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class SdrMeta(Base):
    """Meta mensal por agente: CLT tem meta de valor vendido (R$), estagiário
    tem meta de captação (contagem de leads)."""
    __tablename__ = "sdr_metas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("uuid_generate_v4()"))
    nome = Column(String(255), nullable=False, unique=True)
    tipo = Column(String(20), nullable=False)  # 'clt' | 'estagiario'
    meta_valor = Column(Numeric(12, 2), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())
