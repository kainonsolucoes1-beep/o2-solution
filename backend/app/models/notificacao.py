from sqlalchemy import Column, String, ForeignKey, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class Notificacao(Base):
    """Aviso pro sino do topo (ex: "você recebeu um lead"). Fica não lida até
    a pessoa abrir o sino (lida_em)."""
    __tablename__ = "notificacoes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=True)  # vazio = aviso de lote
    texto = Column(String(300), nullable=False)
    criado_em = Column(TIMESTAMP, server_default=func.now())
    lida_em = Column(TIMESTAMP, nullable=True)
