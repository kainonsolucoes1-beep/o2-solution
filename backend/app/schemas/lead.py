from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
from datetime import datetime


class LeadCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    origin: Optional[str] = None
    status: Optional[str] = "novo"
    value_potential: Optional[float] = None
    notes: Optional[str] = None
    document: Optional[str] = None
    modalidade: Optional[str] = None
    categoria: Optional[str] = None
    conversion_point: Optional[str] = None
    attendant: Optional[str] = None
    visibility_tag: Optional[str] = None


class LeadResponse(LeadCreate):
    id: UUID
    user_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeadReportItem(BaseModel):
    id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    attendant: Optional[str] = None
    origem: Optional[str] = None
    conversion_point: Optional[str] = None
    base: Optional[str] = None
    status: Optional[str] = None
    perception: Optional[str] = None
    value_potential: Optional[float] = None
    receita_real_recebida: Optional[float] = None
    receita_real_a_receber: Optional[float] = None
    receita_titular: Optional[str] = None
    receita_promotora: Optional[str] = None
    receita_modalidade: Optional[str] = None
    receita_operadora: Optional[str] = None
    receita_categoria: Optional[str] = None
    receita_data_venda: Optional[datetime] = None
    receita_origem: Optional[str] = None
    visibility_tag: Optional[str] = None
    is_renutrucao: bool = False
    retrabalhado_em: Optional[datetime] = None
    lost_reason: Optional[str] = None
    lost_message: Optional[str] = None
    modalidade: Optional[str] = None
    current_plan: Optional[str] = None
    operadoras_enviadas: Optional[str] = None
    document: Optional[str] = None
    tracking_campaign: Optional[str] = None
    tracking_medium: Optional[str] = None
    tracking_term: Optional[str] = None
    tracking_format: Optional[str] = None
    fbclid: Optional[str] = None
    gclid: Optional[str] = None
    lgpd_processing_opt_in: Optional[bool] = None
    lgpd_communication_opt_in: Optional[bool] = None
    first_interaction_at: Optional[datetime] = None
    last_interaction_at: Optional[datetime] = None
    team: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None


class LeadsReportResponse(BaseModel):
    total: int
    page: int
    limit: int
    leads: List[LeadReportItem]


class BulkDeleteRequest(BaseModel):
    ids: List[str]


class BulkDeleteResponse(BaseModel):
    deleted: int


class StatusUpdateRequest(BaseModel):
    status: str
    lost_reason: Optional[str] = None


class StatusUpdateResponse(BaseModel):
    success: bool
    lead_id: UUID
    status: str


class LeadInfoUpdateRequest(BaseModel):
    name: Optional[str] = None
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    attendant: Optional[str] = None
    document: Optional[str] = None
    origin: Optional[str] = None
    modalidade: Optional[str] = None
    conversion_point: Optional[str] = None
    perception: Optional[str] = None
    created_at: Optional[str] = None  # AAAA-MM-DD — restrito a admin, corrige a "epoca" do lead
    visibility_tag: Optional[str] = None  # "ADM" restringe a visualizacao do lead
    operadoras_enviadas: Optional[str] = None  # lista separada por virgula
    current_plan: Optional[str] = None
    value_potential: Optional[float] = None


class LeadInfoUpdateResponse(BaseModel):
    success: bool
    lead_id: UUID
    name: str
    company: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    attendant: Optional[str] = None
    document: Optional[str] = None
    origin: Optional[str] = None
    modalidade: Optional[str] = None
    conversion_point: Optional[str] = None
    perception: Optional[str] = None
    current_plan: Optional[str] = None
    value_potential: Optional[float] = None
    created_at: Optional[datetime] = None
    operadoras_enviadas: Optional[str] = None
    visibility_tag: Optional[str] = None


class LeadReceitaUpdateRequest(BaseModel):
    titular: Optional[str] = None
    promotora: Optional[str] = None
    modalidade: Optional[str] = None
    operadora: Optional[str] = None
    categoria: Optional[str] = None
    data_venda: Optional[str] = None  # AAAA-MM-DD


class LeadReceitaUpdateResponse(BaseModel):
    success: bool
    lead_id: UUID
    receita_origem: str
    receita_titular: Optional[str] = None
    receita_promotora: Optional[str] = None
    receita_modalidade: Optional[str] = None
    receita_operadora: Optional[str] = None
    receita_categoria: Optional[str] = None
    receita_data_venda: Optional[datetime] = None
    receita_real_recebida: Optional[float] = None
    receita_real_a_receber: Optional[float] = None


class ParcelaRequest(BaseModel):
    numero: Optional[int] = None
    valor: float
    status: str  # 'recebido' | 'a_receber'
    previsao_recebimento: Optional[str] = None  # AAAA-MM-DD


class ParcelaUpdateRequest(BaseModel):
    numero: Optional[int] = None
    valor: Optional[float] = None
    status: Optional[str] = None
    previsao_recebimento: Optional[str] = None  # AAAA-MM-DD


class ParcelaResponse(BaseModel):
    id: UUID
    numero: Optional[int] = None
    valor: float
    status: str
    previsao_recebimento: Optional[datetime] = None


class ParcelasListResponse(BaseModel):
    receita_origem: str
    receita_real_recebida: Optional[float] = None
    receita_real_a_receber: Optional[float] = None
    parcelas: List[ParcelaResponse]


class LeadVendaRequest(BaseModel):
    valor: float
    data_venda: str  # AAAA-MM-DD


class LeadVendaResponse(BaseModel):
    success: bool
    lead_id: UUID


class LeadFaturarResponse(BaseModel):
    success: bool
    lead_id: UUID


class RetrabalharRequest(BaseModel):
    data_retrabalho: Optional[str] = None  # AAAA-MM-DD; se omitido, usa a data/hora atual


class RetrabalharResponse(BaseModel):
    success: bool
    lead_id: UUID
    status: str
    retrabalhado_em: datetime


class AttachmentResponse(BaseModel):
    id: UUID
    file_name: str
    file_size: int
    content_type: Optional[str] = None
    uploaded_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class AttachmentsListResponse(BaseModel):
    attachments: List[AttachmentResponse]


class AttachmentUploadResponse(BaseModel):
    success: bool
    attachment: AttachmentResponse


class AttachmentDownloadResponse(BaseModel):
    url: str


class NoteCreateRequest(BaseModel):
    content: str


class NoteCreateResponse(BaseModel):
    success: bool
    note_id: UUID
    created_at: datetime


class NoteResponse(BaseModel):
    id: UUID
    content: str
    created_by: str
    created_at: datetime

    class Config:
        from_attributes = True


class NotesListResponse(BaseModel):
    notes: List[NoteResponse]


class StatusHistoryItem(BaseModel):
    id: UUID
    from_status: Optional[str] = None
    to_status: str
    changed_at: datetime
    changed_by: Optional[str] = None

    class Config:
        from_attributes = True


class StatusHistoryResponse(BaseModel):
    history: List[StatusHistoryItem]


class ScheduleCreateRequest(BaseModel):
    scheduled_at: datetime


class ScheduleItem(BaseModel):
    id: UUID
    scheduled_at: datetime
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ScheduleHistoryResponse(BaseModel):
    schedules: List[ScheduleItem]


class AgendaItem(BaseModel):
    id: UUID
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    attendant: Optional[str] = None
    origem: Optional[str] = None
    conversion_point: Optional[str] = None
    status: Optional[str] = None
    perception: Optional[str] = None
    value_potential: Optional[float] = None
    current_plan: Optional[str] = None
    created_at: datetime
    followize_id: Optional[int] = None
    scheduled_at: datetime
    schedule_id: UUID


class AgendaResponse(BaseModel):
    items: List[AgendaItem]


class AgendaAlertsResponse(BaseModel):
    overdue: int
    today: int


class RenutricaoPreviewRow(BaseModel):
    row: int
    nome: str
    telefone: str
    modalidade: Optional[str] = None
    data_reativacao: Optional[str] = None
    match_status: str  # "ok" | "not_found" | "ambiguous" | "invalid_date"
    lead_id: Optional[UUID] = None
    lead_nome_atual: Optional[str] = None
    detail: str


class RenutricaoPreviewResponse(BaseModel):
    rows: List[RenutricaoPreviewRow]
    total: int
    matched: int
    unmatched: int


class RenutricaoConfirmItem(BaseModel):
    lead_id: UUID
    data_reativacao: str  # AAAA-MM-DD


class RenutricaoConfirmRequest(BaseModel):
    items: List[RenutricaoConfirmItem]


class RenutricaoConfirmResponse(BaseModel):
    success: bool
    updated: int
