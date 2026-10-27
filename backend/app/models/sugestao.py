from datetime import datetime, timezone
import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def _agora():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Sugestao(Base):
    """Sugestão de melhoria da equipe (aba Sugestões). Todos veem todas; só
    admin muda o status e exclui; o autor edita enquanto está pendente."""
    __tablename__ = "sugestoes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    texto = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pendente")  # pendente | andamento | concluido
    autor_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    autor_nome = Column(String(150), nullable=True)
    criado_em = Column(TIMESTAMP, nullable=False, default=_agora)
    editado_em = Column(TIMESTAMP, nullable=True)
    status_em = Column(TIMESTAMP, nullable=True)          # última mudança de status
    status_por = Column(String(150), nullable=True)


class SugestaoImagem(Base):
    __tablename__ = "sugestao_imagens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sugestao_id = Column(UUID(as_uuid=True), ForeignKey("sugestoes.id", ondelete="CASCADE"), nullable=False, index=True)
    file_name = Column(String(255), nullable=False)
    content_type = Column(String(50), nullable=False)
    file_size = Column(Integer, nullable=False)
    storage_key = Column(String(500), nullable=False)  # objeto no bucket R2
    criado_em = Column(TIMESTAMP, nullable=False, default=_agora)


class SugestaoEvento(Base):
    """Rastreio: criação, edição e mudança de status, com quem e quando.
    O nome fica copiado pra sobreviver a conta removida/renomeada."""
    __tablename__ = "sugestao_eventos"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sugestao_id = Column(UUID(as_uuid=True), ForeignKey("sugestoes.id", ondelete="CASCADE"), nullable=False, index=True)
    acao = Column(String(20), nullable=False)  # criada | editada | status
    detalhe = Column(String(200), nullable=True)  # ex: "pendente → andamento"
    por_nome = Column(String(150), nullable=True)
    em = Column(TIMESTAMP, nullable=False, default=_agora)
