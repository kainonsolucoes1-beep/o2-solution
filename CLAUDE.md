# Project Guidelines

## Behavior
- Respond short and direct. No parágrafos.
- Ao terminar: resumo de 2-3 linhas — o que mudou + o que testar no staging. Nada além disso.
- Output diffs (use Edit), não arquivos inteiros.

## Coding Rules (Karpathy)
- State assumptions before coding. Ask if uncertain.
- Minimum code that solves the problem. Nothing speculative.
- Touch only what was requested. Do not refactor adjacent code.
- Remove only imports/variables that YOUR changes made unused.
- Define success criteria before starting multi-step tasks.

## Stack
- FastAPI (Python) + React (TypeScript, Vite) + PostgreSQL, Docker Compose no AWS Lightsail.
- Backend entry: `backend/app/main.py` · Frontend entry: `frontend/src/main.tsx`

## Onde fica cada coisa
- Telas (`frontend/src/pages/`): `Dashboard`, `LeadsReport` (Relatório), `Pipeline`,
  `GestaoComercial` (Fluxo), `KPIs` (Performance), `VidaSDR` (Vida do Agente / "Meu desempenho"),
  `Financeiro`, `Settings`, `Users`, `Agenda`
- Ficha do lead: `pages/LeadDetailPage.tsx` + `components/Lead*Panel.tsx`
- Nav / menu lateral: `components/Sidebar.tsx`
- Rotas API (`backend/app/api/`): `leads_routes`, `pipeline_routes`, `dashboard_routes`,
  `gestao_comercial_routes`, `kpis_routes`, `financeiro_routes`, `admin_routes`, `auth_routes`
- Modelos: `backend/app/models/lead.py`, `models/user.py`
- Acesso / papéis: `backend/app/access_policy.py`, `backend/app/security.py`
- Tokens de tema (claro/escuro): `frontend/src/index.css`

## Convenções
- **Migrations:** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` em `main.py` (no import + no `startup_event`). Sem Alembic.
- **Deploy builda só com `npx vite build` (sem tsc)** — rodar `cd frontend && npx tsc --noEmit` antes de commitar.
- Frontend local aponta pra API de **produção**; sem acesso à API de staging/localhost (CORS). Verificar componente visualmente = **harness local** (ver skill `component-harness`).
- Data de contagem por período: `EFFECTIVE_CAPTACAO = func.coalesce(Lead.retrabalhado_em, Lead.created_at)`.
- `Lead.status` vem com grafias variadas (`proposta` / `proposal_sent` / `proposal sent`) — filtro precisa expandir todas.
- Papéis restritos (`usuario`, `comercial`, `supervisor`) têm janela de horário / dispositivo — desligada em prod (flags dormentes) e ignorada no staging (`APP_ENV=staging`).

## Deploy
- Commit na branch **`staging`** → GitHub Actions builda imagens GHCR → `staging.o2sig.com.br`. Usuária testa.
- Promover pra prod: `git checkout main && git merge --ff-only origin/staging && git push origin main`.
- A usuária **nunca** roda git na instância. Depois de subir, monitorar `/health` de prod e staging (`curl -s -o /dev/null -w "%{http_code}"`).

## Safety Rules
- Never modify `.env`, `.env.production`, `.env.staging`.
- Never modify `docker-compose.prod.yml` unless explicitly requested.
- Touch only files directly related to the task.
