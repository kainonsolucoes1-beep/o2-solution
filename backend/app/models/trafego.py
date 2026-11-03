from sqlalchemy import Column, String, Numeric, Date, TIMESTAMP, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class TrafegoGasto(Base):
    """Valor investido em tráfego pago numa semana (Financeiro > Tráfego pago).
    A semana é seg-dom recortada no mês: semana_inicio é o primeiro dia dela
    DENTRO do mês, então a soma das semanas fecha exatamente o mês."""
    __tablename__ = "trafego_gastos"
    __table_args__ = (UniqueConstraint("plataforma", "semana_inicio", name="uq_trafego_gasto_semana"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("uuid_generate_v4()"))
    plataforma = Column(String(20), nullable=False)  # 'google' | 'meta'
    semana_inicio = Column(Date, nullable=False, index=True)
    valor = Column(Numeric(12, 2), nullable=False)
    updated_by = Column(String(255), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())
