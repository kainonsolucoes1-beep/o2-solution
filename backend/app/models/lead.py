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
    ages_raw = Column(String(100), nullable=True)
    modalidade = Column(String(255), nullable=True)
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