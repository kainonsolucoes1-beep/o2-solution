#!/usr/bin/env bash
# Restaura o banco do staging com o backup mais recente de producao, pra
# staging nunca ficar desatualizado em relacao aos dados reais.
# 1. acha o dump local mais recente (ja gerado por backup_db.sh)
# 2. pula silenciosamente se o staging nao estiver no ar (e' sob demanda)
# 3. restaura com --clean --if-exists (idempotente, sobrescreve tudo)
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-o2_solution}"

LATEST="$(ls -t "$BACKUP_DIR"/o2_*.dump 2>/dev/null | head -n1 || true)"
if [ -z "$LATEST" ]; then
  echo ">>> [$(date -Is)] nenhum dump encontrado em $BACKUP_DIR -- abortando"
  exit 1
fi

if [ -z "$(docker compose -f "$COMPOSE_FILE" --env-file .env.staging ps -q postgres 2>/dev/null)" ]; then
  echo ">>> [$(date -Is)] staging nao esta no ar (sob demanda) -- pulando restore"
  exit 0
fi

echo ">>> [$(date -Is)] restaurando staging com $LATEST"
docker compose -f "$COMPOSE_FILE" --env-file .env.staging exec -T postgres \
  pg_restore -U "$DB_USER" -d "$DB_NAME" --clean --if-exists --no-owner < "$LATEST"
echo ">>> [$(date -Is)] restore do staging concluido"
