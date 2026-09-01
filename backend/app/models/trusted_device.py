from sqlalchemy import Column, String, Boolean, TIMESTAMP, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class TrustedDevice(Base):
    """Aparelho de onde um perfil interno pode acessar (frente 1c). Criado como
    pendente no primeiro login daquele navegador; um admin aprova."""
    __tablename__ = "trusted_devices"
    __table_args__ = (UniqueConstraint("user_id", "device_id", name="uq_trusted_device"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device_id = Column(String(64), nullable=False)   # uuid gerado no navegador
    label = Column(String(200), nullable=True)        # navegador · SO, pra identificar
    approved = Column(Boolean, nullable=False, default=False)
    approved_by = Column(String(120), nullable=True)
    last_seen_at = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
