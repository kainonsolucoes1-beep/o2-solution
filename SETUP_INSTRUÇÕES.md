# 🚀 Setup: Criando o Repo Profissional

## Passo 1: Criar Estrutura de Pastas

```bash
mkdir o2-solution
cd o2-solution

# Backend
mkdir -p backend/app/{api,models,schemas,services,security}
mkdir -p backend/tests

# Frontend
mkdir -p frontend/src/{components,pages,hooks,services}

# Database
mkdir -p database/migrations
```

## Passo 2: Copiar Arquivos da Pasta outputs/

Você baixou estes arquivos:
- `o2-solution_.gitignore` → renomear para `.gitignore`
- `o2-solution_docker-compose.yml` → copiar para raiz como `docker-compose.yml`
- `o2-solution_.env.example` → copiar para raiz como `.env.example`
- `backend_requirements.txt` → copiar para `backend/requirements.txt`
- `backend_main.py` → copiar para `backend/app/main.py`
- `backend_Dockerfile` → copiar para `backend/Dockerfile`
- `database_schema.sql` → copiar para `database/schema.sql`
- `README.md` → copiar para raiz

## Passo 3: Criar arquivo .env (local)

```bash
cp .env.example .env
```

## Passo 4: Inicializar Git

```bash
git init
git add .
git commit -m "Initial commit: project structure"

# (Opcional) Push to GitHub
# git remote add origin seu-repo-url
# git push -u origin main
```

## Passo 5: Rodar com Docker

```bash
docker-compose up
```

Pronto! Backend rodando em http://localhost:8000

## Verificar

- http://localhost:8000/docs (Swagger UI)
- http://localhost:8000/health (Health check)
- http://localhost:8000/api/v1/leads (Lista vazia por enquanto)

---

**Próximo**: Conectar PostgreSQL ao backend
