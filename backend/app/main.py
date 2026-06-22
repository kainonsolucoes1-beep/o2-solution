import logging

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
from app.api.auth_routes import get_current_user
from app.api.leads_routes import _is_admin
from app.sync_followize import start_sync_scheduler, start_token_refresh_scheduler, sync_leads_backfill

load_dotenv()
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="O2 Solution API",
    description="Platform SaaS de gestão de leads",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "http://localhost", "http://127.0.0.1:3000"],
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
            existing.password_hash = password_hash
    if not db_session.query(AppSettings).filter(AppSettings.key == "forms_credentials_key").first():
        db_session.add(AppSettings(key="forms_credentials_key", value=secrets.token_urlsafe(32)))
    db_session.commit()


# Startup event para sincronização Followize
@app.on_event("startup")
async def startup_event():
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_point VARCHAR(255)"))
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
    from app.models.app_settings import AppSettings as _AS
    from app.database import SessionLocal as _SL
    _db = _SL()
    try:
        if not _db.query(_AS).filter(_AS.key == "conversion_point_backfill_done").first():
            _db.add(_AS(key="conversion_point_backfill_done", value="1"))
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
