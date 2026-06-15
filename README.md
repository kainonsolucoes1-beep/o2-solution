# O2 Solution

SaaS de gestão de leads profissional.

## Stack

- Backend: Python + FastAPI
- Frontend: React + Next.js
- Database: PostgreSQL
- DevOps: Docker

## Quick Start (Desenvolvimento Local)

```bash
# 1. Criar pasta do projeto
mkdir o2-solution
cd o2-solution

# 2. Copiar arquivos de SETUP_INSTRUÇÕES.md
# (Baixe de outputs/ e coloque nas pastas corretas)

# 3. Copiar .env
cp .env.example .env

# 4. Rodar tudo
docker-compose up

# Backend: http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Estrutura

```
o2-solution/
├─ backend/          FastAPI
├─ frontend/         React
├─ database/         SQL
├─ docker-compose.yml
└─ .env.example
```

## Próximos Passos

1. Implementar autenticação JWT
2. Conectar leads ao PostgreSQL
3. Build frontend React
4. Deploy

---

**Status**: MVP 0.1.0 - Em desenvolvimento
