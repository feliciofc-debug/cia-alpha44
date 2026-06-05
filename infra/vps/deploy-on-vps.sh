#!/bin/bash
set -euo pipefail
cd /opt/cia-alpha44/infra/vps
PASS=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 32)
printf 'POSTGRES_USER=cia_app\nPOSTGRES_PASSWORD=%s\nPOSTGRES_DB=cia_alpha44\n' "$PASS" > .env
chmod 600 .env
docker compose up -d
sleep 8
docker compose ps
docker inspect --format='{{.State.Health.Status}}' cia-postgres
