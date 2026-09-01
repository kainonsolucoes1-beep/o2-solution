from sqlalchemy import Column, String, Boolean, TIMESTAMP, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(100))
    last_name = Column(String(100))
    role = Column(String(50), default="usuario")
    team = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, nullable=False, default=False)
    birth_date = Column(Date, nullable=True)
    phone = Column(String(20), nullable=True)
    cpf = Column(String(14), nullable=True)
    hire_date = Column(Date, nullable=True)
    termination_date = Column(Date, nullable=True)
    last_login_at = Column(TIMESTAMP, nullable=True)
    last_login_ip = Column(String(64), nullable=True)
    # exceção à janela de horário (frente 1b) — libera acesso fora de 9h–16h
    horario_estendido = Column(Boolean, nullable=False, server_default='false', default=False)
    created_at = Column(TIMESTAMP, server_default=func.now())
    updated_at = Column(TIMESTAMP, server_default=func.now())