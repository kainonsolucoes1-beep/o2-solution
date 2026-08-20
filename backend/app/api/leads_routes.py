import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.api.auth_routes import get_current_user
from app.database import get_db
from app.lead_utils import extract_base
from app.models import Lead, LeadNote, LeadStatusHistory, LeadSchedule, LeadParcela, User
from app.security import can_see_financials
from app.tz_utils import br_date_to_utc_range, now_br
from app.schemas.lead import (
    LeadCreate, LeadReportItem, LeadResponse, LeadsReportResponse,
    BulkDeleteRequest, BulkDeleteResponse,
    StatusUpdateRequest, StatusUpdateResponse,
    LeadInfoUpdateRequest, LeadInfoUpdateResponse,
    LeadVendaRequest, LeadVendaResponse, LeadFaturarResponse,
    NoteCreateRequest, NoteCreateResponse,
    NoteResponse, NotesListResponse,
    StatusHistoryItem, StatusHistoryResponse,
    ScheduleCreateRequest, ScheduleItem, ScheduleHistoryResponse,
    AgendaItem, AgendaResponse, AgendaAlertsResponse,
    LeadReceitaUpdateRequest, LeadReceitaUpdateResponse,
    ParcelaRequest, ParcelaUpdateRequest, ParcelaResponse, ParcelasListResponse,
    RetrabalharResponse,
)
from app.schemas.user import OperatorInfo

router = APIRouter(prefix="/api/v1", tags=["leads"])


def _is_admin(user: User) -> bool:
    return user.role == "admin"


@router.get("/leads", response_model=List[LeadResponse])
def list_leads(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Lead)
    if not _is_admin(current_user):
        q = q.filter(Lead.user_id == current_user.id)
    return q.all()


@router.post("/leads", response_model=LeadResponse, status_code=201)
def create_lead(
    lead_data: LeadCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if lead_data.email:
        duplicate = (
            db.query(Lead)
            .filter(Lead.user_id == current_user.id, Lead.email == lead_data.email)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="Já existe um lead com este email")

    lead = Lead(**lead_data.model_dump(), user_id=current_user.id)
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/leads/bulk", response_model=BulkDeleteResponse)
def delete_leads_bulk(
    payload: BulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    if not payload.ids:
        raise HTTPException(status_code=422, detail="Nenhum lead informado")

    deleted = (
        db.query(Lead)
        .filter(Lead.id.in_(payload.ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return BulkDeleteResponse(deleted=deleted)


@router.get("/leads/by-period", response_model=LeadsReportResponse)
def leads_by_period(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    origem: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    perception: Optional[str] = Query(None),
    modalidade: Optional[str] = Query(None),
    conversion_point: Optional[str] = Query(None),
    lost_reason: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    search: Optional[str] = Query(None, description="Busca por nome, CPF/CNPJ, telefone ou email"),
    vencidos: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=10000),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        start, _ = br_date_to_utc_range(date_from)
        _, end = br_date_to_utc_range(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")

    cutoff_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    admin = _is_admin(current_user)
    my_name = current_user.first_name or current_user.username

    _active_statuses = ("pending", "novo", "new", "qualificado", "qualified", "proposal_sent")
    _active_filter = or_(
        func.lower(Lead.status).in_([s.lower() for s in _active_statuses]),
        Lead.perception.in_(["Quente", "Morno"]),
    )

    searching = bool(search and search.strip())

    def _base_query(q):
        if vencidos:
            q = q.filter(Lead.updated_at <= cutoff_24h, _active_filter)
        if not searching:
            q = q.filter(Lead.created_at >= start, Lead.created_at < end)
        if not admin:
            q = q.filter(Lead.origin == my_name)
        elif origem:
            parts = [s.strip() for s in origem.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.origin == parts[0])
            else:
                q = q.filter(Lead.origin.in_(parts))
        if status:
            statuses = [s.strip().lower() for s in status.split(',')]
            q = q.filter(func.lower(Lead.status).in_(statuses))
        if perception:
            percs = [p.strip() for p in perception.split(',')]
            q = q.filter(Lead.perception.in_(percs))
        if modalidade:
            parts = [s.strip() for s in modalidade.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.modalidade == parts[0])
            else:
                q = q.filter(Lead.modalidade.in_(parts))
        if conversion_point:
            q = q.filter(Lead.conversion_point.ilike(conversion_point))
        if lost_reason:
            parts = [s.strip() for s in lost_reason.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.lost_reason == parts[0])
            else:
                q = q.filter(Lead.lost_reason.in_(parts))
        if team:
            parts = [s.strip() for s in team.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.team == parts[0])
            else:
                q = q.filter(Lead.team.in_(parts))
        if searching:
            term = search.strip()
            digits = re.sub(r"\D", "", term)
            conditions = [func.unaccent(Lead.name).ilike(func.unaccent(f"%{term}%")), Lead.email.ilike(f"%{term}%")]
            if digits:
                conditions.append(func.regexp_replace(Lead.phone, r'\D', '', 'g').ilike(f"%{digits}%"))
                conditions.append(Lead.document.ilike(f"%{digits}%"))
            q = q.filter(or_(*conditions))
        return q

    total = _base_query(db.query(func.count(Lead.id))).scalar() or 0

    rows = (
        _base_query(
            db.query(
                Lead.id, Lead.name, Lead.email, Lead.phone,
                Lead.company, Lead.attendant,
                Lead.status, Lead.perception, Lead.value_potential,
                Lead.created_at, Lead.updated_at, Lead.origin, Lead.is_renutrucao,
                Lead.retrabalhado_em,
                Lead.lost_reason, Lead.lost_message, Lead.modalidade,
                Lead.conversion_point, Lead.current_plan, Lead.document,
                Lead.tracking_campaign, Lead.tracking_medium, Lead.tracking_term, Lead.tracking_format,
                Lead.fbclid, Lead.gclid, Lead.lgpd_processing_opt_in, Lead.lgpd_communication_opt_in,
                Lead.first_interaction_at, Lead.last_interaction_at, Lead.team,
            )
        )
        .order_by(Lead.created_at.desc())
        .offset((page - 1) * limit)
        .limit(limit)
        .all()
    )

    leads = [
        LeadReportItem(
            id=r.id, name=r.name, email=r.email, phone=r.phone,
            company=r.company, attendant=r.attendant,
            status=r.status, perception=r.perception,
            value_potential=float(r.value_potential) if r.value_potential is not None else None,
            created_at=r.created_at,
            updated_at=r.updated_at,
            origem=r.origin,
            conversion_point=r.conversion_point,
            is_renutrucao=bool(r.is_renutrucao),
            retrabalhado_em=r.retrabalhado_em,
            lost_reason=r.lost_reason,
            lost_message=r.lost_message,
            modalidade=r.modalidade,
            current_plan=r.current_plan,
            document=r.document,
            tracking_campaign=r.tracking_campaign,
            tracking_medium=r.tracking_medium,
            tracking_term=r.tracking_term,
            tracking_format=r.tracking_format,
            fbclid=r.fbclid,
            gclid=r.gclid,
            lgpd_processing_opt_in=r.lgpd_processing_opt_in,
            lgpd_communication_opt_in=r.lgpd_communication_opt_in,
            first_interaction_at=r.first_interaction_at,
            last_interaction_at=r.last_interaction_at,
            team=r.team,
        )
        for r in rows
    ]

    return LeadsReportResponse(total=total, page=page, limit=limit, leads=leads)


@router.get("/leads/report-stats")
def leads_report_stats(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    origem: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    perception: Optional[str] = Query(None),
    modalidade: Optional[str] = Query(None),
    conversion_point: Optional[str] = Query(None),
    lost_reason: Optional[str] = Query(None),
    team: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    vencidos: bool = Query(False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Contagens (total/fechados/perdidos/quentes) para os cards de resumo do
    Relatorio de Leads, respeitando os mesmos filtros de /leads/by-period."""
    try:
        start, _ = br_date_to_utc_range(date_from)
        _, end = br_date_to_utc_range(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")

    cutoff_24h = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=24)
    admin = _is_admin(current_user)
    my_name = current_user.first_name or current_user.username

    _active_statuses = ("pending", "novo", "new", "qualificado", "qualified", "proposal_sent")
    _active_filter = or_(
        func.lower(Lead.status).in_([s.lower() for s in _active_statuses]),
        Lead.perception.in_(["Quente", "Morno"]),
    )

    searching = bool(search and search.strip())

    def _base_query(q):
        if vencidos:
            q = q.filter(Lead.updated_at <= cutoff_24h, _active_filter)
        if not searching:
            q = q.filter(Lead.created_at >= start, Lead.created_at < end)
        if not admin:
            q = q.filter(Lead.origin == my_name)
        elif origem:
            parts = [s.strip() for s in origem.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.origin == parts[0])
            else:
                q = q.filter(Lead.origin.in_(parts))
        if status:
            statuses = [s.strip().lower() for s in status.split(',')]
            q = q.filter(func.lower(Lead.status).in_(statuses))
        if perception:
            percs = [p.strip() for p in perception.split(',')]
            q = q.filter(Lead.perception.in_(percs))
        if modalidade:
            parts = [s.strip() for s in modalidade.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.modalidade == parts[0])
            else:
                q = q.filter(Lead.modalidade.in_(parts))
        if conversion_point:
            q = q.filter(Lead.conversion_point.ilike(conversion_point))
        if lost_reason:
            parts = [s.strip() for s in lost_reason.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.lost_reason == parts[0])
            else:
                q = q.filter(Lead.lost_reason.in_(parts))
        if team:
            parts = [s.strip() for s in team.split(',') if s.strip()]
            if len(parts) == 1:
                q = q.filter(Lead.team == parts[0])
            else:
                q = q.filter(Lead.team.in_(parts))
        if searching:
            term = search.strip()
            digits = re.sub(r"\D", "", term)
            conditions = [func.unaccent(Lead.name).ilike(func.unaccent(f"%{term}%")), Lead.email.ilike(f"%{term}%")]
            if digits:
                conditions.append(func.regexp_replace(Lead.phone, r'\D', '', 'g').ilike(f"%{digits}%"))
                conditions.append(Lead.document.ilike(f"%{digits}%"))
            q = q.filter(or_(*conditions))
        return q

    fechados_set = [s.lower() for s in ("waiting_billing", "sale_performed", "fechado", "closed", "won", "convertido")]

    total = _base_query(db.query(func.count(Lead.id))).scalar() or 0
    fechados = _base_query(db.query(func.count(Lead.id))).filter(func.lower(Lead.status).in_(fechados_set)).scalar() or 0
    perdidos = _base_query(db.query(func.count(Lead.id))).filter(func.lower(Lead.status) == "sale_not_performed").scalar() or 0
    quentes = _base_query(db.query(func.count(Lead.id))).filter(Lead.perception == "Quente").scalar() or 0

    return {"total": total, "fechados": fechados, "perdidos": perdidos, "quentes": quentes}


@router.get("/users", response_model=List[OperatorInfo])
def list_operators(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    rows = db.query(User).filter(User.is_active.is_(True)).order_by(User.first_name).all()
    return [OperatorInfo(id=r.id, name=r.first_name or r.username) for r in rows]


@router.get("/leads/origins", response_model=List[str])
def list_origins(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Lead.origin)
        .filter(Lead.origin.isnot(None), Lead.origin != "")
        .distinct()
        .order_by(Lead.origin)
        .all()
    )
    origins = [r.origin for r in rows]
    if "ADM" not in origins:
        origins.append("ADM")
        origins.sort()
    return origins


@router.get("/leads/conversion-points", response_model=List[str])
def list_conversion_points(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Lead.conversion_point)
        .filter(Lead.conversion_point.isnot(None), Lead.conversion_point != "")
        .distinct()
        .order_by(Lead.conversion_point)
        .all()
    )
    points = [r.conversion_point for r in rows]
    if "Adm" not in points:
        points.append("Adm")
        points.sort()
    return points


@router.get("/leads/lost-reasons", response_model=List[str])
def list_lost_reasons(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")
    rows = (
        db.query(Lead.lost_reason)
        .filter(Lead.lost_reason.isnot(None), Lead.lost_reason != "")
        .distinct()
        .order_by(Lead.lost_reason)
        .all()
    )
    return [r.lost_reason for r in rows]


@router.get("/leads/modalidades", response_model=List[str])
def list_modalidades(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Lead.modalidade)
        .filter(Lead.modalidade.isnot(None), Lead.modalidade != "")
        .distinct()
        .order_by(Lead.modalidade)
        .all()
    )
    modalidades = [r.modalidade for r in rows]
    for fixa in ("PF", "PME", "Odonto PF", "Odonto PME"):
        if fixa not in modalidades:
            modalidades.append(fixa)
    modalidades.sort()
    return modalidades


@router.get("/leads/{lead_id}", response_model=LeadReportItem)
def get_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    show_fin = can_see_financials(current_user)
    return LeadReportItem(
        id=lead.id, name=lead.name, email=lead.email, phone=lead.phone,
        company=lead.company, attendant=lead.attendant,
        origem=lead.origin, conversion_point=lead.conversion_point,
        base=extract_base(lead.notes),
        status=lead.status, perception=lead.perception,
        value_potential=float(lead.value_potential) if lead.value_potential is not None else None,
        receita_real_recebida=float(lead.receita_real_recebida) if show_fin and lead.receita_real_recebida is not None else None,
        receita_real_a_receber=float(lead.receita_real_a_receber) if show_fin and lead.receita_real_a_receber is not None else None,
        receita_titular=lead.receita_titular if show_fin else None,
        receita_promotora=lead.receita_promotora if show_fin else None,
        receita_modalidade=lead.receita_modalidade if show_fin else None,
        receita_operadora=lead.receita_operadora if show_fin else None,
        receita_categoria=lead.receita_categoria if show_fin else None,
        receita_data_venda=lead.receita_data_venda if show_fin else None,
        receita_origem=lead.receita_origem if show_fin else None,
        visibility_tag=lead.visibility_tag,
        is_renutrucao=bool(lead.is_renutrucao),
        retrabalhado_em=lead.retrabalhado_em,
        lost_reason=lead.lost_reason, lost_message=lead.lost_message,
        modalidade=lead.modalidade, current_plan=lead.current_plan,
        operadoras_enviadas=lead.operadoras_enviadas, document=lead.document,
        tracking_campaign=lead.tracking_campaign, tracking_medium=lead.tracking_medium,
        tracking_term=lead.tracking_term, tracking_format=lead.tracking_format,
        fbclid=lead.fbclid, gclid=lead.gclid,
        lgpd_processing_opt_in=lead.lgpd_processing_opt_in,
        lgpd_communication_opt_in=lead.lgpd_communication_opt_in,
        first_interaction_at=lead.first_interaction_at, last_interaction_at=lead.last_interaction_at,
        team=lead.team,
        created_at=lead.created_at, updated_at=lead.updated_at,
    )


@router.post("/leads/{lead_id}/status", response_model=StatusUpdateResponse)
def update_lead_status(
    lead_id: str,
    body: StatusUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    prev_status = lead.status
    lead.status = body.status
    if body.lost_reason is not None:
        lead.lost_reason = body.lost_reason.strip() or None
    lead.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    history = LeadStatusHistory(
        lead_id=lead.id,
        from_status=prev_status,
        to_status=body.status,
        changed_at=lead.updated_at,
        changed_by=current_user.first_name or current_user.username,
    )
    db.add(history)
    db.commit()
    return StatusUpdateResponse(success=True, lead_id=lead.id, status=lead.status)


@router.post("/leads/{lead_id}/retrabalhar", response_model=RetrabalharResponse)
def retrabalhar_lead(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reativa um lead parado/cancelado: mantem created_at intacto (historico real),
    mas marca retrabalhado_em com a data de hoje — os relatorios de captacao por
    periodo passam a contar esse lead na data do retrabalho, nao na original."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")

    prev_status = lead.status
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    lead.retrabalhado_em = now
    lead.status = "novo"
    lead.is_renutrucao = True
    lead.updated_at = now

    db.add(LeadStatusHistory(
        lead_id=lead.id,
        from_status=prev_status,
        to_status="novo",
        changed_at=now,
        changed_by=current_user.first_name or current_user.username,
    ))
    db.add(LeadNote(
        lead_id=lead.id,
        user_id=current_user.id,
        content=f"Lead retrabalhado — reativado por {current_user.first_name or current_user.username}",
    ))
    db.commit()
    db.refresh(lead)
    return RetrabalharResponse(success=True, lead_id=lead.id, status=lead.status, retrabalhado_em=lead.retrabalhado_em)


@router.post("/leads/{lead_id}/info", response_model=LeadInfoUpdateResponse)
def update_lead_info(
    lead_id: str,
    body: LeadInfoUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if body.name is not None and body.name.strip():
        lead.name = body.name.strip()
    if body.company is not None:
        lead.company = body.company.strip() or None
    if body.email is not None:
        lead.email = body.email.strip() or None
    if body.phone is not None:
        lead.phone = body.phone.strip() or None
    if body.attendant is not None:
        lead.attendant = body.attendant.strip() or None
    if body.document is not None:
        lead.document = body.document.strip() or None
    if body.origin is not None:
        lead.origin = body.origin.strip() or None
    if body.modalidade is not None:
        lead.modalidade = body.modalidade.strip() or None
    if body.conversion_point is not None:
        lead.conversion_point = body.conversion_point.strip() or None
    if body.perception is not None:
        lead.perception = body.perception.strip() or None
    if body.created_at is not None:
        if not _is_admin(current_user):
            raise HTTPException(status_code=403, detail="Apenas administradores podem alterar a data de criação do lead")
        try:
            new_created_at, _ = br_date_to_utc_range(body.created_at)
        except ValueError:
            raise HTTPException(status_code=400, detail="Data inválida, use o formato AAAA-MM-DD")
        # lead do passado: desloca o historico de status junto (mesmo delta), pra nao
        # ficar com "criado ha X meses" seguido de "virou Novo/Fechado hoje"
        delta = new_created_at - lead.created_at
        lead.created_at = new_created_at
        for h in db.query(LeadStatusHistory).filter(LeadStatusHistory.lead_id == lead.id).all():
            h.changed_at = h.changed_at + delta
    if body.visibility_tag is not None:
        lead.visibility_tag = body.visibility_tag.strip() or None
    if body.operadoras_enviadas is not None:
        lead.operadoras_enviadas = body.operadoras_enviadas.strip() or None
    if body.current_plan is not None:
        lead.current_plan = body.current_plan.strip() or None
    if body.value_potential is not None:
        lead.value_potential = body.value_potential
    db.commit()
    return LeadInfoUpdateResponse(
        success=True, lead_id=lead.id, name=lead.name,
        company=lead.company, email=lead.email, phone=lead.phone, attendant=lead.attendant,
        document=lead.document, origin=lead.origin, modalidade=lead.modalidade,
        conversion_point=lead.conversion_point, perception=lead.perception,
        created_at=lead.created_at, visibility_tag=lead.visibility_tag,
        operadoras_enviadas=lead.operadoras_enviadas,
        current_plan=lead.current_plan,
        value_potential=float(lead.value_potential) if lead.value_potential is not None else None,
    )


def _recalc_receita_from_parcelas(db: Session, lead: Lead) -> None:
    parcelas = db.query(LeadParcela).filter(LeadParcela.lead_id == lead.id).all()
    lead.receita_real_recebida = sum((p.valor for p in parcelas if p.status == "recebido"), 0)
    lead.receita_real_a_receber = sum((p.valor for p in parcelas if p.status == "a_receber"), 0)


def _parse_date_or_none(s: str | None) -> datetime | None:
    if not s or not s.strip():
        return None
    try:
        return br_date_to_utc_range(s.strip())[0]
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida, use o formato AAAA-MM-DD")


@router.post("/leads/{lead_id}/receita", response_model=LeadReceitaUpdateResponse)
def update_lead_receita(
    lead_id: str,
    body: LeadReceitaUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Lanca dados gerais de receita direto na Ficha do Lead (fora da planilha).
    Marca receita_origem='manual', o que blinda o lead do sync automatico —
    se ele depois aparecer na planilha com status valido, ela reassume o controle."""
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if body.titular is not None:
        lead.receita_titular = body.titular.strip() or None
    if body.promotora is not None:
        lead.receita_promotora = body.promotora.strip() or None
    if body.modalidade is not None:
        lead.receita_modalidade = body.modalidade.strip() or None
    if body.operadora is not None:
        lead.receita_operadora = body.operadora.strip() or None
    if body.categoria is not None:
        lead.receita_categoria = body.categoria.strip() or None
    if body.data_venda is not None:
        lead.receita_data_venda = _parse_date_or_none(body.data_venda)
    lead.receita_origem = "manual"
    db.commit()
    return LeadReceitaUpdateResponse(
        success=True, lead_id=lead.id, receita_origem=lead.receita_origem,
        receita_titular=lead.receita_titular, receita_promotora=lead.receita_promotora,
        receita_modalidade=lead.receita_modalidade, receita_operadora=lead.receita_operadora,
        receita_categoria=lead.receita_categoria, receita_data_venda=lead.receita_data_venda,
        receita_real_recebida=float(lead.receita_real_recebida) if lead.receita_real_recebida is not None else None,
        receita_real_a_receber=float(lead.receita_real_a_receber) if lead.receita_real_a_receber is not None else None,
    )


@router.get("/leads/{lead_id}/parcelas", response_model=ParcelasListResponse)
def list_lead_parcelas(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    parcelas = (
        db.query(LeadParcela)
        .filter(LeadParcela.lead_id == lead.id)
        .order_by(LeadParcela.numero.asc().nullsfirst())
        .all()
    )
    return ParcelasListResponse(
        receita_origem=lead.receita_origem,
        receita_real_recebida=float(lead.receita_real_recebida) if lead.receita_real_recebida is not None else None,
        receita_real_a_receber=float(lead.receita_real_a_receber) if lead.receita_real_a_receber is not None else None,
        parcelas=[
            ParcelaResponse(id=p.id, numero=p.numero, valor=float(p.valor), status=p.status, previsao_recebimento=p.previsao_recebimento)
            for p in parcelas
        ],
    )


@router.post("/leads/{lead_id}/parcelas", response_model=ParcelasListResponse)
def create_lead_parcela(
    lead_id: str,
    body: ParcelaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if body.status not in ("recebido", "a_receber"):
        raise HTTPException(status_code=400, detail="Status deve ser 'recebido' ou 'a_receber'")
    previsao = _parse_date_or_none(body.previsao_recebimento)
    db.add(LeadParcela(lead_id=lead.id, numero=body.numero, valor=body.valor, status=body.status, previsao_recebimento=previsao))
    lead.receita_origem = "manual"
    db.flush()
    _recalc_receita_from_parcelas(db, lead)
    db.commit()
    return list_lead_parcelas(lead_id, current_user, db)


@router.patch("/leads/{lead_id}/parcelas/{parcela_id}", response_model=ParcelasListResponse)
def update_lead_parcela(
    lead_id: str,
    parcela_id: str,
    body: ParcelaUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    parcela = db.query(LeadParcela).filter(LeadParcela.id == parcela_id, LeadParcela.lead_id == lead.id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")
    if body.numero is not None:
        parcela.numero = body.numero
    if body.valor is not None:
        parcela.valor = body.valor
    if body.status is not None:
        if body.status not in ("recebido", "a_receber"):
            raise HTTPException(status_code=400, detail="Status deve ser 'recebido' ou 'a_receber'")
        parcela.status = body.status
    if body.previsao_recebimento is not None:
        parcela.previsao_recebimento = _parse_date_or_none(body.previsao_recebimento)
    lead.receita_origem = "manual"
    _recalc_receita_from_parcelas(db, lead)
    db.commit()
    return list_lead_parcelas(lead_id, current_user, db)


@router.delete("/leads/{lead_id}/parcelas/{parcela_id}", response_model=ParcelasListResponse)
def delete_lead_parcela(
    lead_id: str,
    parcela_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not can_see_financials(current_user):
        raise HTTPException(status_code=403, detail="Acesso negado")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    parcela = db.query(LeadParcela).filter(LeadParcela.id == parcela_id, LeadParcela.lead_id == lead.id).first()
    if not parcela:
        raise HTTPException(status_code=404, detail="Parcela não encontrada")
    db.delete(parcela)
    lead.receita_origem = "manual"
    db.flush()
    _recalc_receita_from_parcelas(db, lead)
    db.commit()
    return list_lead_parcelas(lead_id, current_user, db)


@router.post("/leads/{lead_id}/venda", response_model=LeadVendaResponse)
def registrar_venda(
    lead_id: str,
    body: LeadVendaRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Registra o valor final e a data da venda fechada; o valor entra como
    'a receber' ate o faturamento (ver /faturar)."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    try:
        data_venda, _ = br_date_to_utc_range(body.data_venda)
    except ValueError:
        raise HTTPException(status_code=400, detail="Data inválida, use o formato AAAA-MM-DD")
    lead.receita_real_a_receber = body.valor
    lead.receita_data_venda = data_venda
    db.commit()
    return LeadVendaResponse(success=True, lead_id=lead.id)


@router.post("/leads/{lead_id}/faturar", response_model=LeadFaturarResponse)
def faturar_venda(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Move o valor pendente (a receber) para recebido, concluindo o faturamento."""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    pendente = lead.receita_real_a_receber or 0
    lead.receita_real_recebida = (lead.receita_real_recebida or 0) + pendente
    lead.receita_real_a_receber = 0
    db.commit()
    return LeadFaturarResponse(success=True, lead_id=lead.id)


@router.get("/leads/{lead_id}/status-history", response_model=StatusHistoryResponse)
def get_status_history(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadStatusHistory)
        .filter(LeadStatusHistory.lead_id == lead_id)
        .order_by(LeadStatusHistory.changed_at.asc())
        .all()
    )
    return StatusHistoryResponse(history=rows)


@router.post("/leads/{lead_id}/realign-history", response_model=StatusHistoryResponse)
def realign_lead_history(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Corrige leads do passado cujo historico de status ficou "preso" na data
    de hoje depois que a Data de Criacao foi corrigida antes desse deslocamento
    automatico existir. Desloca todo o historico pelo mesmo delta entre a
    primeira entrada e a Data de Criacao atual, preservando o intervalo entre
    as etapas."""
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Apenas administradores podem corrigir o histórico")
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    rows = (
        db.query(LeadStatusHistory)
        .filter(LeadStatusHistory.lead_id == lead_id)
        .order_by(LeadStatusHistory.changed_at.asc())
        .all()
    )
    if not rows:
        raise HTTPException(status_code=400, detail="Este lead não tem histórico de status para corrigir")
    delta = lead.created_at - rows[0].changed_at
    for h in rows:
        h.changed_at = h.changed_at + delta
    db.commit()
    return StatusHistoryResponse(history=rows)


@router.get("/leads/{lead_id}/notes", response_model=NotesListResponse)
def get_lead_notes(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadNote, User)
        .outerjoin(User, LeadNote.user_id == User.id)
        .filter(LeadNote.lead_id == lead_id)
        .order_by(LeadNote.created_at.desc())
        .all()
    )
    notes = [
        NoteResponse(
            id=note.id,
            content=note.content,
            created_by=(user.first_name or user.username) if user else "Usuário",
            created_at=note.created_at,
        )
        for note, user in rows
    ]
    return NotesListResponse(notes=notes)


@router.post("/leads/{lead_id}/schedule", response_model=ScheduleItem)
def create_schedule(
    lead_id: str,
    body: ScheduleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    db.query(LeadSchedule).filter(
        LeadSchedule.lead_id == lead_id, LeadSchedule.is_active.is_(True)
    ).update({"is_active": False})
    schedule = LeadSchedule(
        lead_id=lead.id,
        scheduled_at=body.scheduled_at,
        created_by=current_user.first_name or current_user.username,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)
    return schedule


@router.delete("/leads/{lead_id}/schedule", status_code=204)
def cancel_schedule(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(LeadSchedule).filter(
        LeadSchedule.lead_id == lead_id, LeadSchedule.is_active.is_(True)
    ).update({"is_active": False})
    db.commit()


@router.get("/leads/{lead_id}/schedule-history", response_model=ScheduleHistoryResponse)
def get_schedule_history(
    lead_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(LeadSchedule)
        .filter(LeadSchedule.lead_id == lead_id)
        .order_by(LeadSchedule.created_at.desc())
        .all()
    )
    return ScheduleHistoryResponse(schedules=rows)


@router.get("/agenda", response_model=AgendaResponse)
def get_agenda(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        start, _ = br_date_to_utc_range(date_from)
        _, end = br_date_to_utc_range(date_to)
    except ValueError:
        raise HTTPException(status_code=422, detail="Formato de data inválido. Use YYYY-MM-DD.")

    rows = (
        db.query(LeadSchedule, Lead)
        .join(Lead, LeadSchedule.lead_id == Lead.id)
        .filter(
            LeadSchedule.is_active.is_(True),
            LeadSchedule.scheduled_at >= start,
            LeadSchedule.scheduled_at < end,
        )
        .order_by(LeadSchedule.scheduled_at.asc())
        .all()
    )
    items = [
        AgendaItem(
            id=lead.id, name=lead.name, email=lead.email, phone=lead.phone,
            company=lead.company, attendant=lead.attendant, origem=lead.origin,
            conversion_point=lead.conversion_point, status=lead.status,
            perception=lead.perception,
            value_potential=float(lead.value_potential) if lead.value_potential is not None else None,
            current_plan=lead.current_plan,
            created_at=lead.created_at, followize_id=lead.followize_id,
            scheduled_at=sched.scheduled_at, schedule_id=sched.id,
        )
        for sched, lead in rows
    ]
    return AgendaResponse(items=items)


@router.get("/agenda/alerts/count", response_model=AgendaAlertsResponse)
def get_agenda_alerts_count(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not _is_admin(current_user):
        raise HTTPException(status_code=403, detail="Acesso restrito a administradores")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    _, end_of_today = br_date_to_utc_range(now_br().date())

    overdue = (
        db.query(func.count(LeadSchedule.id))
        .filter(LeadSchedule.is_active.is_(True), LeadSchedule.scheduled_at < now)
        .scalar()
    )
    today = (
        db.query(func.count(LeadSchedule.id))
        .filter(
            LeadSchedule.is_active.is_(True),
            LeadSchedule.scheduled_at >= now,
            LeadSchedule.scheduled_at < end_of_today,
        )
        .scalar()
    )
    return AgendaAlertsResponse(overdue=overdue, today=today)


@router.post("/leads/{lead_id}/notes", response_model=NoteCreateResponse)
def create_lead_note(
    lead_id: str,
    body: NoteCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    note = LeadNote(lead_id=lead.id, user_id=current_user.id, content=body.content)
    db.add(note)
    if 'renutrição' in body.content.lower():
        lead.is_renutrucao = True
    db.commit()
    db.refresh(note)
    return NoteCreateResponse(success=True, note_id=note.id, created_at=note.created_at)
