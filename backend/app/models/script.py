from datetime import datetime, timezone
import uuid

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, Text, TIMESTAMP
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


def _agora():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Script(Base):
    """Script de atendimento (aba Scripts). Guarda só o estado atual -- cada
    criação/edição/arquivamento também grava uma ScriptVersao, que é o rastreio
    completo (quem, quando e o texto daquela versão)."""
    __tablename__ = "scripts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    titulo = Column(String(150), nullable=False)
    categoria = Column(String(60), nullable=False)
    conteudo = Column(Text, nullable=False)
    versao = Column(Integer, nullable=False, default=1)  # nº da última ScriptVersao
    arquivado = Column(Boolean, nullable=False, default=False, server_default="false")
    criado_por_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    criado_por_nome = Column(String(150), nullable=True)
    criado_em = Column(TIMESTAMP, nullable=False, default=_agora)
    atualizado_por_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    atualizado_por_nome = Column(String(150), nullable=True)
    atualizado_em = Column(TIMESTAMP, nullable=False, default=_agora)


class ScriptVersao(Base):
    """Uma linha por mudança num script, nunca apagada nem editada. O nome de
    quem fez fica copiado (por_nome) pra o histórico sobreviver se a conta for
    removida/renomeada."""
    __tablename__ = "script_versoes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    script_id = Column(UUID(as_uuid=True), ForeignKey("scripts.id", ondelete="CASCADE"), nullable=False, index=True)
    versao = Column(Integer, nullable=False)
    acao = Column(String(20), nullable=False)  # criado | editado | restaurado | arquivado | reativado
    titulo = Column(String(150), nullable=False)
    categoria = Column(String(60), nullable=False)
    conteudo = Column(Text, nullable=False)
    detalhe = Column(String(200), nullable=True)  # ex: "restaurou a versão 2"
    por_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    por_nome = Column(String(150), nullable=True)
    em = Column(TIMESTAMP, nullable=False, default=_agora)
