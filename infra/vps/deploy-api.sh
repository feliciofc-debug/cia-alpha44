#!/bin/bash
# Deploy da API CIA / Alpha 44 na VPS (Node + systemd).
# Uso (na VPS como root): bash /opt/cia-alpha44/infra/vps/deploy-api.sh

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/feliciofc-debug/cia-alpha44.git}"
APP_DIR="${APP_DIR:-/opt/cia-alpha44}"
ENV_API="/etc/cia-alpha44/api.env"
SERVICE="cia-api.service"

echo ">> Backup .env Postgres (se existir)..."
VPS_ENV_BACKUP=""
if [[ -f "$APP_DIR/infra/vps/.env" ]]; then
  VPS_ENV_BACKUP=$(mktemp)
  cp "$APP_DIR/infra/vps/.env" "$VPS_ENV_BACKUP"
fi

echo ">> Atualizando código em $APP_DIR..."
if [[ -d "$APP_DIR/.git" ]]; then
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [[ -n "$VPS_ENV_BACKUP" && -f "$VPS_ENV_BACKUP" ]]; then
  mkdir -p "$APP_DIR/infra/vps"
  cp "$VPS_ENV_BACKUP" "$APP_DIR/infra/vps/.env"
  chmod 600 "$APP_DIR/infra/vps/.env"
  rm -f "$VPS_ENV_BACKUP"
fi

echo ">> Postgres (docker)..."
cd "$APP_DIR/infra/vps"
docker compose up -d
sleep 3

echo ">> Build monorepo (API)..."
cd "$APP_DIR"
npm ci
npm run build:api

echo ">> Arquivo de ambiente da API..."
mkdir -p /etc/cia-alpha44
set -a
# shellcheck disable=SC1091
source "$APP_DIR/infra/vps/.env"
set +a

if [[ ! -f "$ENV_API" ]]; then
  cat > "$ENV_API" <<EOF
NODE_ENV=production
PORT=3333
HOST=0.0.0.0
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-6
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}
WEB_ORIGIN=http://localhost:5173
EOF
  chmod 600 "$ENV_API"
else
  echo "   (mantido $ENV_API existente — use set-claude-key.sh para a chave)"
fi

mkdir -p /var/lib/cia-alpha44
if ! grep -q '^BENCHMARK_PLANILHA_PATH=' "$ENV_API" 2>/dev/null; then
  echo "BENCHMARK_PLANILHA_PATH=/var/lib/cia-alpha44/benchmark-fob-kg.json" >> "$ENV_API"
  echo "   (+ BENCHMARK_PLANILHA_PATH em $ENV_API)"
fi

echo ">> Migrate..."
set -a
# shellcheck disable=SC1091
source "$ENV_API"
set +a
npm run db:migrate:deploy -w @cia/db
npm run db:backfill-icms-p2-2 -w @cia/db
npm run db:seed -w @cia/db

echo ">> systemd $SERVICE..."
cp "$APP_DIR/infra/vps/cia-api.service" "/etc/systemd/system/$SERVICE"
systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"
sleep 2
systemctl status "$SERVICE" --no-pager || true

echo ">> Health..."
curl -sf "http://127.0.0.1:3333/api/health" && echo ""
echo ">> Próximo passo: bash $APP_DIR/infra/vps/set-claude-key.sh"
