from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID


class SdrMetaCreate(BaseModel):
    nome: str
    tipo: str  # 'clt' | 'estagiario'
    meta_valor: float
    vigente_desde: Optional[str] = None  # 'YYYY-MM'; padrao = mes atual


class SdrMetaUpdate(BaseModel):
    nome: Optional[str] = None
    tipo: Optional[str] = None
    meta_valor: Optional[float] = None
    vigente_desde: Optional[str] = None  # 'YYYY-MM'; padrao = mes atual


class SdrMetaProgress(BaseModel):
    id: UUID
    nome: str
    tipo: str
    meta_valor: float
    leads: int
    vendas: int
    atingido: float
    pct: float
    projecao: Optional[float] = None

    class Config:
        from_attributes = True


class SdrMetasListResponse(BaseModel):
    mes_label: str
    ano_mes: str
    metas: List[SdrMetaProgress]
