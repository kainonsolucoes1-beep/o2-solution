from sqlalchemy import Column, String, Text, Numeric, Boolean, ForeignKey, TIMESTAMP, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base

class Lead(Base):
    __tablename__ = "leads"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    followize_id = Column(Integer, nullable=True, unique=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    name = Column(String(255), nullable=False)
    email = Column(String(255))
    phone = Column(String(255))
    company = Column(String(255))
    origin = Column(String(100))
    conversion_point = Column(String(255), nullable=True)
    attendant = Column(String(255))
    status = Column(String(50), default="novo")
    perception = Column(String(20))
    value_potential = Column(Numeric(12, 2))
    notes = Column(Text)
    is_renutrucao = Column(Boolean, default=False, nullable=False, server_default='false')
    # quando um lead cancelado/parado e' retrabalhado, esta data marca a
    # "captacao efetiva" pros relatorios de periodo, sem apagar created_at
    # (historico real de quando o lead nasceu)
    retrabalhado_em = Column(TIMESTAMP, nullable=True)
    # quando true, o sync do Followize nao sobrescreve mais o origin desta lead
    # (usado pra proteger correcoes manuais feitas apos o lead ser reativado)
    origin_locked = Column(Boolean, default=False, nullable=False, server_default='false')
    ages_raw = Column(String(100), nullable=True)
    modalidade = Column(String(255), nullable=True)
    categoria = Column(String(255), nullable=True)
    current_plan = Column(String(255), nullable=True)
    document = Column(String(20), nullable=True)
    lost_reason = Column(String(255), nullable=True)
    lost_message = Column(Text, nullable=True)
    tracking_campaign = Column(String(255), nullable=True)
    tracking_medium = Column(String(255), nullable=True)
    tracking_term = Column(String(255), nullable=True)
    tracking_format = Column(String(255), nullable=True)
    fbclid = Column(String(255), nullable=True)
    gclid = Column(String(255), nullable=True)
    lgpd_processing_opt_in = Column(Boolean, nullable=True)
    lgpd_communication_opt_in = Column(Boolean, nullable=True)
    first_interaction_at = Column(TIMESTAMP, nullable=True)
    last_interaction_at = Column(TIMESTAMP, nullable=True)
    team = Column(String(255), nullable=True)
    receita_real_recebida = Column(Numeric(12, 2), nullable=True)
    receita_real_a_receber = Column(Numeric(12, 2), nullable=True)
    receita_titular = Column(String(255), nullable=True)
    receita_promotora = Column(String(255), nullable=True)
    receita_modalidade = Column(String(255), nullable=True)
    receita_operadora = Column(String(255), nullable=True)
    receita_categoria = Column(String(255), nullable=True)
    # 'sheet' (default -- vem do sync da planilha) ou 'manual' (lancado direto
    # na Ficha do Lead). O sync so' gerencia/zera leads com origem 'sheet'.
    receita_origem = Column(String(10), nullable=False, server_default='sheet')
    visibility_tag = Column(String(50), nullable=True)
    operadoras_enviadas = Column(Text, nullable=True)  # lista separada por virgula
    receita_data_venda = Column(TIMESTAMP, nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())


class LeadNote(Base):
    __tablename__ = "lead_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    content = Column(Text, nullable=False)
    created_at = Column(TIMESTAMP, server_default=func.now())


class LeadStatusHistory(Base):
    __tablename__ = "lead_status_history"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    from_status = Column(String(50), nullable=True)
    to_status = Column(String(50), nullable=False)
    changed_at = Column(TIMESTAMP, server_default=func.now())
    changed_by = Column(String(255), nullable=True)


class LeadSchedule(Base):
    __tablename__ = "lead_schedules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    scheduled_at = Column(TIMESTAMP, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False, server_default='true')
    created_by = Column(String(255), nullable=True)
    created_at = Column(TIMESTAMP, server_default=func.now())


class LeadAttachment(Base):
    __tablename__ = "lead_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    content_type = Column(String(100), nullable=True)
    storage_key = Column(String(500), nullable=False)  # chave do objeto no bucket R2
    created_at = Column(TIMESTAMP, server_default=func.now())


class LeadParcela(Base):
    """Detalhamento por parcela da receita real (planilha de vendas), por lead."""
    __tablename__ = "lead_parcelas"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lead_id = Column(UUID(as_uuid=True), ForeignKey("leads.id", ondelete="CASCADE"), nullable=False)
    numero = Column(Integer, nullable=True)  # 1-7; null = valor unico, sem quebra em parcelas
    valor = Column(Numeric(12, 2), nullable=False)
    status = Column(String(20), nullable=False)  # 'recebido' | 'a_receber'
    previsao_recebimento = Column(TIMESTAMP, nullable=True)  # extraido da nota da celula na planilha
    updated_at = Column(TIMESTAMP, server_default=func.now())