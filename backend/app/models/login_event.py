from sqlalchemy import Column, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class LoginEvent(Base):
    """Registro de cada tentativa de login — sucesso ou falha. Base pro histórico
    de acesso e pras travas de dispositivo/horário (frente 1b/1c)."""
    __tablename__ = "login_events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    email_tried = Column(String(255), nullable=True)
    success = Column(Boolean, nullable=False, default=True)
    ip = Column(String(64), nullable=True)
    user_agent = Column(String(400), nullable=True)
    # primeiro login bem-sucedido desse usuário a partir desse IP
    new_ip = Column(Boolean, nullable=False, default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
