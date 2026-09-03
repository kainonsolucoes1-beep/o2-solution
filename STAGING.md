# Staging — `staging.o2sig.com.br`

Ambiente de teste **co-hospedado** na mesma instância da produção, ligado **sob demanda**.
Serve pra validar mudança arriscada (migração de dados, controle de acesso, refactor grande)
antes de tocar na produção.

- Projeto Docker próprio: `o2-staging` (containers `o2-staging-*`, volume `o2-staging_postgres_staging_data`)
- Banco **separado e vazio** (schema criado no 1º boot; sem dados de produção)
- Sync do Followize e schedulers **desligados** (`APP_ENV=staging` em `backend/app/main.py`)
- O Caddy da produção roteia `staging.o2sig.com.br` → `staging-frontend` pela rede `o2-edge`
- Enquanto está desligado, `staging.o2sig.com.br` responde 502 e **não afeta** o `o2sig.com.br`

---

## Setup (uma vez)

### 1. DNS (registro.br)
Adicionar registro **A**:

```
staging.o2sig.com.br  →  54.86.238.165   (mesmo IP da produção)
```

Fazer isso **antes** de subir o staging pela primeira vez — o Caddy fica tentando emitir
o certificado até o DNS propagar (uns minutos).

### 2. `.env.staging` na instância
Via SSH, na pasta `/home/ubuntu/o2-solution`, criar o arquivo `.env.staging`
(está no `.gitignore`, nunca vai pro repo):

```bash
APP_ENV=staging

# Banco do staging (container próprio, volume próprio)
DB_USER=admin
DB_PASSWORD=<gere uma senha só do staging>
DB_NAME=o2_solution
POSTGRES_USER=admin
POSTGRES_PASSWORD=<a mesma senha acima>
POSTGRES_DB=o2_solution
DATABASE_URL=postgresql://admin:<a mesma senha>@postgres:5432/o2_solution

# JWT próprio — token de staging não pode valer na produção
SECRET_KEY=<gere um segredo novo: openssl rand -hex 32>
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# Followize / R2 desligados no staging (schedulers não rodam mesmo assim)
FOLLOWIZE_API_URL=
FOLLOWIZE_ACCESS_TOKEN=
FOLLOWIZE_REFRESH_TOKEN=
R2_ENDPOINT=
R2_BUCKET_NAME=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=

CORS_ORIGINS=https://staging.o2sig.com.br
DEBUG=false
FASTAPI_ENV=staging
META_DAILY=0
META_MONTHLY=0
```

Gerar os segredos:
```bash
openssl rand -hex 32   # SECRET_KEY
openssl rand -hex 16   # DB_PASSWORD
```

---

## Uso no dia a dia

### Subir / atualizar o staging
```bash
git checkout -b staging       # 1ª vez; depois é só `git checkout staging`
git merge main                # opcional, pra partir do estado atual da produção
# ... suas mudanças ...
git push origin staging
```
O workflow **Deploy staging** builda as imagens da branch `staging` e sobe os containers.
Em ~3-5 min: `https://staging.o2sig.com.br` (com a tarja laranja "STAGING").

### Desligar o staging (libera RAM da instância)
GitHub → **Actions → Deploy staging → Run workflow → action: `down`**.
Faz `docker compose down` do projeto `o2-staging`. Sempre desligar depois de testar.

### Promover pra produção
```bash
git checkout main
git merge staging
git push origin main
```
O deploy de produção pega a imagem já buildada (mesmo commit) — rápido, sem rebuild.

---

## Popular o staging com dados reais (quando precisar)

Por padrão o banco é vazio. Pra testar com volume real, restaurar o backup diário do R2
**no container do staging**:

```bash
# na instância, com o staging no ar
LATEST=$(rclone lsf r2:<bucket>/backups/ | sort | tail -1)
rclone cat "r2:<bucket>/backups/$LATEST" | gunzip \
  | docker exec -i o2-staging-postgres-1 psql -U admin -d o2_solution
```
(`rclone` está em `~/.local/bin` — ver `o2_solution_backup_setup`.)
Isso traz PII da empresa pro banco de staging — tratar com o mesmo cuidado de acesso.

---

## Limitações conhecidas

- O `docker-compose.staging.yml` que a instância usa vem da branch **main**. Se precisar
  testar mudança **no próprio compose de staging**, ela tem que passar pela `main` antes.
- Sem rollback automático no staging (é ambiente de teste — se não subir, corrige e re-push).
- Staging e produção dividem os 1 GB de RAM da instância enquanto o staging está no ar —
  por isso o `down` depois de testar.
