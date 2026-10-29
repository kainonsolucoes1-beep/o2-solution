from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class LeadSinalPendente(Base):
    """Aviso da tag do GTM ("este formulário veio de um clique no Google Ads")
    que chegou antes do lead. O aviso sai do navegador no envio do formulário;
    o lead chega pelo plugin do WordPress logo depois. Fica aqui até o lead
    entrar (ver public_routes) e é descartado depois de 1h."""
    __tablename__ = "lead_sinais_pendentes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    host = Column(String(255), nullable=False)
    phone_digits = Column(String(20), nullable=True)
    email = Column(String(255), nullable=True)
    click_id = Column(String(255), nullable=False)  # gclid, ou "gbraid:..."/"wbraid:..."
    created_at = Column(TIMESTAMP, server_default=func.now())
