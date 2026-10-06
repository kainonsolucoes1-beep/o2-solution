from sqlalchemy import Column, String, Text, Boolean, ForeignKey, TIMESTAMP, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid
from app.database import Base


class CampanhaSmsLote(Base):
    """Um disparo de SMS em massa feito fora do sistema (Kolmeya), importado
    por planilha: envio (quem foi pro disparo) + retorno (o que a Kolmeya
    conseguiu enviar/entregar). Identificado pelo job da Kolmeya."""
    __tablename__ = "campanha_sms_lotes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    job = Column(String(30), nullable=False, unique=True)
    data_disparo = Column(TIMESTAMP, nullable=True)  # UTC naive, menor "criacao" do retorno
    enviados = Column(Integer, nullable=False, default=0)   # linhas da planilha de envio
    retornos = Column(Integer, nullable=False, default=0)   # linhas da planilha de retorno
    entregues = Column(Integer, nullable=False, default=0)  # retorno com status "entregue"
    importado_por_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    # ultima vez que uma planilha de respostas atualizou este lote (UTC naive) --
    # as respostas chegam ao longo do dia e sao reimportadas varias vezes
    respostas_importadas_em = Column(TIMESTAMP, nullable=True)
    criado_em = Column(TIMESTAMP, server_default=func.now())
    atualizado_em = Column(TIMESTAMP, server_default=func.now(), onupdate=func.now())


class CampanhaSmsResposta(Base):
    """Uma resposta recebida (planilha resposta_kolmeya), ligada ao lote pelo
    job. Guardada linha a linha pra reimportar a mesma planilha não duplicar."""
    __tablename__ = "campanha_sms_respostas"
    __table_args__ = (UniqueConstraint("lote_id", "telefone", "recebido_em", name="uq_sms_resposta"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    lote_id = Column(UUID(as_uuid=True), ForeignKey("campanha_sms_lotes.id", ondelete="CASCADE"), nullable=False)
    telefone = Column(String(30), nullable=False)
    nome = Column(String(255), nullable=True)
    resposta = Column(Text, nullable=True)
    recebido_em = Column(String(30), nullable=False, default="")  # texto como veio da Kolmeya
    positivo = Column(Boolean, nullable=False, default=False)     # resposta == "Sim"
