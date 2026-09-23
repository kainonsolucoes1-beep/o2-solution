#!/usr/bin/env bash
# Backup do Postgres de producao (dump consistente via MVCC, nao trava escrita).
# 1. pg_dump  2. valida com pg_restore --list  3. envia pro R2  4. rotaciona
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
ENV_FILE="${ENV_FILE:-.env.production}"
DB_USER="${DB_USER:-admin}"
DB_NAME="${DB_NAME:-o2_solution}"
R2_BACKUP_BUCKET="${R2_BACKUP_BUCKET:-o2-solution-backups}"
R2_BACKUP_PREFIX="${R2_BACKUP_PREFIX:-db}"

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/o2_${STAMP}.dump"

echo ">>> [$(date -Is)] dump -> $OUT"
docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$OUT"

if ! docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore --list < "$OUT" > /dev/null; then
  echo "!!! dump invalido, removendo $OUT" >&2
  rm -f "$OUT"
  exit 1
fi
echo ">>> OK local: $OUT ($(du -h "$OUT" | cut -f1))"

r2_ok=1
if ! command -v rclone > /dev/null; then
  echo "!!! rclone ausente -- pulando upload R2" >&2
  r2_ok=0
fi

if [ "$r2_ok" = 1 ] && [ -f "$ENV_FILE" ]; then
  while IFS='=' read -r k v; do
    case "$k" in
      R2_ACCESS_KEY_ID|R2_SECRET_ACCESS_KEY|R2_ENDPOINT|R2_BUCKET_NAME) export "$k=$v" ;;
    esac
  done < "$ENV_FILE"
fi

if [ "$r2_ok" = 1 ] && { [ -z "${R2_ACCESS_KEY_ID:-}" ] || [ -z "${R2_SECRET_ACCESS_KEY:-}" ] || [ -z "${R2_ENDPOINT:-}" ]; }; then
  echo "!!! credenciais R2 ausentes em $ENV_FILE -- pulando upload R2" >&2
  r2_ok=0
fi

if [ "$r2_ok" = 1 ]; then
  export RCLONE_CONFIG_R2BK_TYPE=s3
  export RCLONE_CONFIG_R2BK_PROVIDER=Cloudflare
  export RCLONE_CONFIG_R2BK_REGION=auto
  export RCLONE_CONFIG_R2BK_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export RCLONE_CONFIG_R2BK_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export RCLONE_CONFIG_R2BK_ENDPOINT="$R2_ENDPOINT"
  export RCLONE_CONFIG_R2BK_NO_CHECK_BUCKET=true
  DEST="R2BK:${R2_BACKUP_BUCKET}/${R2_BACKUP_PREFIX}"
  echo ">>> enviando para $DEST"
  rclone copy "$OUT" "$DEST/" --s3-no-check-bucket
  rclone delete "$DEST/" --min-age "${RETENTION_DAYS}d" --s3-no-check-bucket || true
  echo ">>> OK remoto: $DEST/$(basename "$OUT")"

  # Anexos dos leads (bucket do app, chaves leads/<id>/...): so' COPIA, nunca
  # apaga no destino -- um anexo excluido no sistema continua guardado no
  # backup. Prefixo proprio (anexos/), fora do alcance da rotacao de 14 dias
  # do dump acima. Falha aqui nao derruba o backup do banco, que ja' concluiu.
  if [ -n "${R2_BUCKET_NAME:-}" ]; then
    ANEXOS_DEST="R2BK:${R2_BACKUP_BUCKET}/anexos/leads"
    echo ">>> copiando anexos R2BK:${R2_BUCKET_NAME}/leads -> $ANEXOS_DEST"
    # timeout: se a rede travar, o script nao fica preso (e nao pula a limpeza
    # local no fim). A copia e' incremental -- na noite seguinte continua de onde parou.
    if timeout "${ANEXOS_TIMEOUT:-30m}" rclone copy "R2BK:${R2_BUCKET_NAME}/leads" "$ANEXOS_DEST" --s3-no-check-bucket; then
      echo ">>> OK anexos: $ANEXOS_DEST"
    else
      echo "!!! falha ao copiar anexos (o backup do banco concluiu normalmente)" >&2
    fi
  else
    echo "!!! R2_BUCKET_NAME ausente em $ENV_FILE -- pulando backup de anexos" >&2
  fi
else
  echo "!!! ATENCAO: backup existe apenas localmente ($OUT). Sem copia offsite."
fi

find "$BACKUP_DIR" -name 'o2_*.dump' -type f -mtime "+${RETENTION_DAYS}" -print -delete

echo ">>> [$(date -Is)] concluido. Backups locais:"
ls -lh "$BACKUP_DIR"/o2_*.dump
