#!/bin/bash
set -euo pipefail
cd /opt/cia-alpha44/packages/db
set -a
source /opt/cia-alpha44/infra/vps/.env
set +a
export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
npm install --omit=dev 2>/dev/null || npm install
npx prisma generate
npx prisma migrate deploy
npx tsx prisma/seed.ts
echo "--- TABELAS ---"
docker exec cia-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c '\dt'
echo "--- TENANT DEFAULT ---"
docker exec cia-postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT id, slug, nome FROM \"Tenant\";"
