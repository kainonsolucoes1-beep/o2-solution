"""
Teste rápido da API Followize v3 — sem banco de dados.
Uso: python test_followize_api.py
"""
import json
import os
import sys

import requests
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

API_URL = os.getenv("FOLLOWIZE_API_URL", "https://api.followize.com.br")
ACCESS_TOKEN = os.getenv("FOLLOWIZE_ACCESS_TOKEN")

if not ACCESS_TOKEN:
    print("ERRO: FOLLOWIZE_ACCESS_TOKEN não encontrado no .env")
    sys.exit(1)

headers = {
    "Authorization": f"Bearer {ACCESS_TOKEN}",
    "Accept": "application/json",
}

from datetime import datetime, timedelta

# v3 exige date_from; busca últimos 90 dias para o teste
date_from = (datetime.utcnow() - timedelta(days=90)).strftime("%Y-%m-%d")
params = {"page": 1, "date_from": date_from}

print(f"GET {API_URL}/v3/leads?page=1&date_from={date_from}")
resp = requests.get(f"{API_URL}/v3/leads", headers=headers, params=params, timeout=30)

print(f"Status: {resp.status_code}")

if resp.status_code != 200:
    print("Resposta:", resp.text[:500])
    sys.exit(1)

data = resp.json()

# Estrutura do response
print("\n--- Chaves raiz ---")
print(list(data.keys()))

meta = data.get("meta") or {}
links = data.get("links") or {}
leads = data.get("data") or []

print(f"\n--- Meta ---")
print(f"  current_page : {meta.get('current_page')}")
print(f"  last_page    : {meta.get('last_page')}")
print(f"  total        : {meta.get('total')}")

print(f"\n--- Links ---")
print(f"  next : {links.get('next')}")

print(f"\n--- Leads nesta página: {len(leads)} ---")

def parse_lead(raw: dict) -> dict:
    contact = raw.get("contact") or {}
    company_obj = contact.get("company")
    company_obj = company_obj if isinstance(company_obj, dict) else {}
    name = raw.get("name") or contact.get("name") or contact.get("full_name") or "Sem nome"
    return {
        "name": name,
        "email": contact.get("email") or raw.get("email"),
        "phone": contact.get("cellphone") or contact.get("phone"),
        "company": company_obj.get("name") or contact.get("company_name"),
        "status": raw.get("status") or "novo",
    }

if leads:
    print(f"\n--- Primeiros 3 leads (campos mapeados) ---")
    for lead in leads[:3]:
        parsed = parse_lead(lead)
        print(json.dumps(parsed, ensure_ascii=False))
    print(f"\nTotal na API (meta.total): {meta.get('total')}")
    print(f"Páginas: {meta.get('last_page')}")
else:
    print("Nenhum lead retornado.")
