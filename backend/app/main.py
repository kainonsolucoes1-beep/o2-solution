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
from app.database import engine, Base, get_db
from app.models import User, Lead, LeadNote, AppSettings
from app.schemas.lead import LeadCreate, LeadResponse
from app.api import auth_routes
from app.api import leads_routes
from app.api import dashboard_routes
from app.api import pipeline_routes
from app.api.auth_routes import get_current_user
from app.api.leads_routes import _is_admin
from app.sync_followize import start_sync_scheduler

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

# Startup event para sincronização Followize
@app.on_event("startup")
async def startup_event():
    asyncio.create_task(start_sync_scheduler())

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
