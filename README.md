# O2 Solution

SaaS de gestão de leads com sync automático Followize → PostgreSQL.

**Stack:** FastAPI · React/Vite · PostgreSQL · Docker · Nginx

---

## Desenvolvimento local

```bash
cp .env.example .env          # preencha os tokens Followize
docker compose up --build     # http://localhost:8000  |  http://localhost:5173
```

---

## Deploy em AWS EC2 (manual via SSH)

### Pré-requisitos na instância

```bash
# Ubuntu 22.04 / Amazon Linux 2023
sudo apt update && sudo apt install -y docker.io git
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
     -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
sudo usermod -aG docker ubuntu   # reiniciar sessão SSH após isso
```

### 1 — Clonar o repositório

```bash
git clone https://github.com/SEU_USUARIO/o2-solution.git
cd o2-solution
```

### 2 — Criar `.env.production`

```bash
cp .env.production .env.production   # já existe no repo como template
nano .env.production                 # preencha todos os campos TROQUE_*
```

Campos obrigatórios:

| Variável | Descrição |
|---|---|
| `SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DB_PASSWORD` | Senha forte para o PostgreSQL |
| `DATABASE_URL` | URL completa do banco (compose local ou RDS) |
| `CORS_ORIGINS` | `["http://SEU_IP"]` ou `["https://seudominio.com"]` |
| `FOLLOWIZE_ACCESS_TOKEN` | Token atual da API Followize |
| `FOLLOWIZE_REFRESH_TOKEN` | Refresh token Followize |

### 3 — Subir em produção

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Serviços levantados:
- **postgres** — banco de dados (porta 5432, interna)
- **backend** — FastAPI (porta 8000, interna)
- **frontend** — React + Nginx (porta **80**, pública)

### 4 — Verificar

```bash
# Health check
curl http://localhost/health

# Logs do backend
docker compose -f docker-compose.prod.yml logs -f backend

# Leads no banco
docker compose -f docker-compose.prod.yml exec postgres \
  psql -U admin -d o2_solution -c "SELECT count(*) FROM leads;"
```

### 5 — Atualizar depois

```bash
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker image prune -f
```

---

## CI/CD automático com GitHub Actions

1. No GitHub → **Settings → Secrets and variables → Actions**, adicione:

   | Secret | Valor |
   |---|---|
   | `EC2_HOST` | IP público da instância EC2 |
   | `EC2_USER` | `ubuntu` (ou `ec2-user`) |
   | `EC2_SSH_KEY` | Conteúdo da chave `.pem` (key pair AWS) |

2. Todo push para `main` dispara `.github/workflows/deploy.yml` que:
   - Conecta via SSH na EC2
   - Faz `git pull`
   - Roda `docker compose -f docker-compose.prod.yml up -d --build`

---

## Usando AWS RDS (opcional)

Se preferir usar RDS em vez do postgres no compose:

1. Comente o serviço `postgres` em `docker-compose.prod.yml`
2. Em `.env.production`, substitua `DATABASE_URL`:
   ```
   DATABASE_URL=postgresql://usuario:senha@SEU_ENDPOINT.rds.amazonaws.com:5432/o2_solution
   ```
3. No Security Group do RDS, permita a instância EC2 na porta 5432.

---

## Estrutura

```
o2-solution/
├── backend/                FastAPI + sync Followize
│   ├── app/
│   │   ├── main.py
│   │   ├── sync_followize.py   # sync automático a cada 30 min
│   │   ├── models/
│   │   ├── schemas/
│   │   └── api/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/               React + Vite + Tailwind
│   ├── src/
│   ├── Dockerfile          # multi-stage: build node → serve nginx
│   └── nginx.conf          # SPA + proxy /api → backend
├── database/
│   └── schema.sql
├── docker-compose.yml          # desenvolvimento local
├── docker-compose.prod.yml     # produção AWS
├── .env.example
└── .env.production             # NÃO commitar — está no .gitignore
```

---

**Status:** v0.1.0 — Backend + Followize sync funcionando. Frontend em desenvolvimento.
