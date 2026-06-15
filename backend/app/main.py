from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="O2 Solution API",
    description="Platform SaaS de gestão de leads",
    version="0.1.0",
)

origins = [
    "http://localhost:3000",
    "http://localhost",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "O2 Solution API v0.1.0 - Running"}

@app.get("/health")
async def health():
    return {"status": "ok", "version": "0.1.0"}

@app.get("/api/v1/leads")
async def list_leads():
    return {
        "status": "success",
        "data": [],
        "message": "Conectado ao PostgreSQL em breve"
    }
