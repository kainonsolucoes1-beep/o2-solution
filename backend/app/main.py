import logging
import secrets

from app.api import login_routes
from app.api import me_routes
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import os
from dotenv import load_dotenv
import asyncio

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
from sqlalchemy import text
from app.database import engine, Base, get_db
from app.models import User, Lead, LeadNote, LeadStatusHistory, AppSettings
from app.models.form_user import FormUser
from app.schemas.lead import LeadCreate, LeadResponse
from app.api import auth_routes
from app.api import leads_routes
from app.api import dashboard_routes
from app.api import pipeline_routes
from app.api import admin_routes
from app.api import activities_routes
from app.api import forms_routes
from app.api import telefonia_routes
from app.api import kpis_routes
from app.api import gestao_comercial_routes
from app.api import public_routes
from app.api import financeiro_routes
from app.api.auth_routes import get_current_user
from app.api.leads_routes import _is_admin
from app.sync_followize import start_sync_scheduler, start_token_refresh_scheduler, sync_leads_backfill

load_dotenv()
Base.metadata.create_all(bind=engine)
with engine.connect() as _conn:
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_plan VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS document VARCHAR(20)"))
    _conn.execute(text("CREATE INDEX IF NOT EXISTS idx_leads_document ON leads(document)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_titular VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_promotora VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_modalidade VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_data_venda TIMESTAMP"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_operadora VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_categoria VARCHAR(255)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS visibility_tag VARCHAR(50)"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS operadoras_enviadas TEXT"))
    _conn.execute(text("ALTER TABLE lead_parcelas ADD COLUMN IF NOT EXISTS previsao_recebimento TIMESTAMP"))
    _conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_origem VARCHAR(10) NOT NULL DEFAULT 'sheet'"))
    _conn.commit()

app = FastAPI(
    title="O2 Solution API",
    description="Platform SaaS de gestão de leads",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", "http://localhost:3000", "http://localhost", "http://127.0.0.1:3000",
        "https://cotacaodeplanossaude.com.br", "https://www.cotacaodeplanossaude.com.br",
        "https://empresarialsulamericasaude.com.br", "https://www.empresarialsulamericasaude.com.br",
        "https://planoalicesaude.com.br", "https://www.planoalicesaude.com.br",
        "https://planoodontosemcarencia.net.br", "https://www.planoodontosemcarencia.net.br",
        "https://planosmedseniorrecife.com.br", "https://www.planosmedseniorrecife.com.br",
        "https://portobairroriodejaneiro.com.br", "https://www.portobairroriodejaneiro.com.br",
        "https://portosaudelinhabairro.com.br", "https://www.portosaudelinhabairro.com.br",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Registrar rotas de autenticação
app.include_router(auth_routes.router)
app.include_router(login_routes.router)
app.include_router(me_routes.router)
app.include_router(leads_routes.router)
app.include_router(dashboard_routes.router)
app.include_router(pipeline_routes.router)
app.include_router(admin_routes.router)
app.include_router(activities_routes.router)
app.include_router(forms_routes.router)
app.include_router(telefonia_routes.router)
app.include_router(kpis_routes.router)
app.include_router(gestao_comercial_routes.router)
app.include_router(public_routes.router)
app.include_router(financeiro_routes.router)

_FORM_USERS_SEED = [
    ("isaac",        "Isaac",        "",           "isaac@equipe.com",         "$2b$12$nNCX6xqvp1CPBWT2VmQQxeRymHfesflUbRrRt5CTo5Je0TKnKnOTS"),
    ("leticia",      "Leticia",      "Matos Silva","leticia@silva.com",         "$2b$12$FLmNwpf6y2Q3zMGlJ9hATOoctEFYfmZgAevAYn.9avAqttvLM36lm"),
    ("julia",        "Julia",        "",           "julia@equipe.com",          "$2b$12$Le12fc4FL64kbMcjk2Z58ejTvI4HBma46QlMGyqV3YBp81bplgz66"),
    ("anny",         "Anny",         "",           "anny@equipe.com.br",        "$2b$12$8WE445z2aNYQGmD4tfkomOEWE5QtIPcVp4av9J9.al3Cam64Zce7a"),
    ("lucas",        "Lucas",        "",           "lucas@admin.com",           "$2b$12$dg98BTCmfkqLqRJ1sCWpZ.KL/mYWqB5f00KgiFrPBphdXZ6.xXKWO"),
    ("rodolfo",      "Rodolfo",      "",           "rodolfo@equipe.com",        "$2b$12$dfT5JVsAyg.ajCERMIACHuBT0G67PvFDKrsYg6mPkg7JBvNpXCYha"),
    ("mariaeduarda", "Maria Eduarda","",           "mariaeduarda@equipe.com",   "$2b$12$KV.vpUYhdM6KRkzagu17qeEEk9v/AEngGBnvdA86orHQaOlrhrlo6"),
    ("clara",        "Clara",        "",           "clara@equipe.com",          "$2b$12$I3fBDL0RL0s6JRaQyfWkg.cmdX5H86FCNQcQgpmPhZK1o1Dp/2Afe"),
    ("kauany",       "Kauany",       "",           "kauany@equipe.com",         "$2b$12$VIK/QMeEkaj.lDD9Th0FtuUOjDuV0kJg2gqk3uvja2D7OQBvBfqTC"),
    ("gabrieli",     "Gabrieli",     "",           "gabrieli@equipe.com",       "$2b$12$bgOiyeFjqXfT5Djtq.v7hOpyoDm2wkA2FwIrSirOIS0eolp8BWON6"),
    ("pedro",        "Pedro",        "",           "pedro@equipe.com",          "$2b$12$wNAoppwqGn1ZXTkiYepX9.gLA0IFmtf42u9mEvR3wAgmAPFniVxj2"),
    ("guilherme",    "Guilherme",    "",           "guilherme@equipe.com",      "$2b$12$Ugbocn2SkMX1c5dM5jtaYe4m7aoOAqVh1nBsTZ4WpfOd5Bx4dvt.q"),
    ("lucascardoso", "Lucas",        "Cardoso",    "lucascardoso@equipe.com",   "$2b$12$cSr2wmE.hlBBjvqEYehffONEHwt6Ijb.pIye2jigxyWBGz10/SaBa"),
]


def _seed_form_users(db_session):
    import secrets
    for username, first_name, last_name, email, password_hash in _FORM_USERS_SEED:
        existing = db_session.query(FormUser).filter(FormUser.username == username).first()
        if not existing:
            db_session.add(FormUser(
                username=username, first_name=first_name,
                last_name=last_name, email=email,
                password_hash=password_hash,
            ))
        else:
            existing.first_name = first_name
            existing.last_name = last_name
    if not db_session.query(AppSettings).filter(AppSettings.key == "forms_credentials_key").first():
        db_session.add(AppSettings(key="forms_credentials_key", value=secrets.token_urlsafe(32)))
    db_session.commit()


# Startup event para sincronização Followize
@app.on_event("startup")
async def startup_event():
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_point VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS is_renutrucao BOOLEAN NOT NULL DEFAULT false"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_reason VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lost_message TEXT"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS modalidade VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS categoria VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_campaign VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_medium VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_term VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS tracking_format VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS fbclid VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS gclid VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lgpd_processing_opt_in BOOLEAN"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS lgpd_communication_opt_in BOOLEAN"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS first_interaction_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_interaction_at TIMESTAMP"))
        conn.execute(text("ALTER TABLE leads ALTER COLUMN phone TYPE VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS team VARCHAR(255)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_real_recebida NUMERIC(12,2)"))
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS receita_real_a_receber NUMERIC(12,2)"))
        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(255)"))
        conn.execute(text("UPDATE users SET role = 'usuario' WHERE role = 'user'"))
        conn.execute(text("UPDATE leads SET categoria = modalidade, modalidade = NULL WHERE modalidade ILIKE '%coparticipa%' AND categoria IS NULL"))
        conn.execute(text("ALTER TABLE telefonia_daily ADD COLUMN IF NOT EXISTS atendimentos_json TEXT NOT NULL DEFAULT '{}'"))
        conn.execute(text("ALTER TABLE telefonia_daily ADD COLUMN IF NOT EXISTS pausas_json TEXT NOT NULL DEFAULT '{}'"))
        conn.execute(text("ALTER TABLE telefonia_daily ADD COLUMN IF NOT EXISTS tma TEXT NOT NULL DEFAULT '—'"))
        conn.execute(text("""
            INSERT INTO lead_status_history (id, lead_id, from_status, to_status, changed_at, changed_by)
            SELECT gen_random_uuid(), l.id, NULL, COALESCE(l.status, 'novo'), l.created_at, 'sistema'
            FROM leads l
            WHERE NOT EXISTS (
                SELECT 1 FROM lead_status_history h WHERE h.lead_id = l.id
            )
        """))
        conn.commit()
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        _seed_form_users(db)
    finally:
        db.close()
    asyncio.create_task(start_sync_scheduler())
    asyncio.create_task(start_token_refresh_scheduler())
    from app.sheets_receita import start_receita_sync_scheduler
    asyncio.create_task(start_receita_sync_scheduler())
    from app.models.app_settings import AppSettings as _AS
    from app.database import SessionLocal as _SL
    _db = _SL()
    try:
        if not _db.query(_AS).filter(_AS.key == "conversion_point_backfill_done").first():
            _db.add(_AS(key="conversion_point_backfill_done", value="1"))
            _db.commit()
            asyncio.create_task(sync_leads_backfill(days=365))
        if not _db.query(_AS).filter(_AS.key == "modalidade_id_backfill_done").first():
            _db.add(_AS(key="modalidade_id_backfill_done", value="1"))
            _db.commit()
            asyncio.create_task(sync_leads_backfill(days=365))
        if not _db.query(_AS).filter(_AS.key == "public_leads_api_key").first():
            _db.add(_AS(key="public_leads_api_key", value=secrets.token_urlsafe(32)))
            _db.commit()
        if not _db.query(_AS).filter(_AS.key == "public_leads_attendants").first():
            _db.add(_AS(key="public_leads_attendants", value="Julia,Breno"))
            _db.commit()
        if not _db.query(_AS).filter(_AS.key == "public_leads_rr_index").first():
            _db.add(_AS(key="public_leads_rr_index", value="0"))
            _db.commit()
        if not _db.query(_AS).filter(_AS.key == "current_plan_backfill_done_v3").first():
            _db.add(_AS(key="current_plan_backfill_done_v3", value="1"))
            _db.commit()
            asyncio.create_task(sync_leads_backfill(days=365))
        if not _db.query(_AS).filter(_AS.key == "document_backfill_done").first():
            _db.add(_AS(key="document_backfill_done", value="1"))
            _db.commit()
            asyncio.create_task(sync_leads_backfill(days=365))
    finally:
        _db.close()

@app.get("/")
async def root():
    return {"message": "O2 Solution API v0.1.0 - Running"}

@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}

@app.get("/api/v1/leads/{lead_id}", response_model=LeadResponse)
def get_lead(lead_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if not _is_admin(current_user) and lead.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    return lead

@app.put("/api/v1/leads/{lead_id}", response_model=LeadResponse)
def update_lead(lead_id: str, lead_data: LeadCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if not _is_admin(current_user) and lead.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    for key, value in lead_data.dict().items():
        setattr(lead, key, value)
    db.commit()
    db.refresh(lead)
    return lead

@app.delete("/api/v1/leads/{lead_id}")
def delete_lead(lead_id: str, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead não encontrado")
    if not _is_admin(current_user) and lead.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Acesso negado")
    db.delete(lead)
    db.commit()
    return {"status": "deleted"}
