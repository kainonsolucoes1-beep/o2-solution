from sqlalchemy import Column, String, Numeric, TIMESTAMP, ForeignKey, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class SdrMeta(Base):
    """Meta mensal por agente: CLT tem meta de valor vendido (R$), estagiário
    tem meta de captação (contagem de leads). tipo/meta_valor aqui = valor
    vigente no mes atual; o historico por mes fica em sdr_metas_mensais."""
    __tablename__ = "sdr_metas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("uuid_generate_v4()"))
    nome = Column(String(255), nullable=False, unique=True)
    tipo = Column(String(20), nullable=False)  # 'clt' | 'estagiario'
    meta_valor = Column(Numeric(12, 2), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())


class SdrMetaMensal(Base):
    """Meta de um agente a partir de um mes (ano_mes = 'YYYY-MM'). Vale ate' o
    proximo registro do mesmo agente -- mes sem linha herda a anterior."""
    __tablename__ = "sdr_metas_mensais"
    __table_args__ = (UniqueConstraint("meta_id", "ano_mes", name="uq_sdr_meta_mensal"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("uuid_generate_v4()"))
    meta_id = Column(UUID(as_uuid=True), ForeignKey("sdr_metas.id", ondelete="CASCADE"), nullable=False, index=True)
    ano_mes = Column(String(7), nullable=False)
    tipo = Column(String(20), nullable=False)
    meta_valor = Column(Numeric(12, 2), nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


def meta_do_mes(db, meta: SdrMeta, year: int, month: int) -> tuple[str, float]:
    """(tipo, meta_valor) vigentes pro agente no mes -- o registro mensal mais
    recente ate' esse mes; sem nenhum, o valor atual de sdr_metas."""
    row = (
        db.query(SdrMetaMensal)
        .filter(SdrMetaMensal.meta_id == meta.id, SdrMetaMensal.ano_mes <= f"{year:04d}-{month:02d}")
        .order_by(SdrMetaMensal.ano_mes.desc())
        .first()
    )
    if row:
        return row.tipo, float(row.meta_valor)
    return meta.tipo, float(meta.meta_valor)
