#!/bin/bash
# Valida api.env antes do deploy P4 (não vaza segredos).
# Uso: bash /opt/cia-alpha44/infra/vps/validate-api-env.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "ERRO: $ENV_API não existe"
  exit 1
fi

echo "=== validate-api-env ==="
echo -n "CLERK_SECRET_KEY count (sk_): "
grep -c '^CLERK_SECRET_KEY=sk_' "$ENV_API" || echo 0

echo -n "CRLF count: "
grep -c $'\r' "$ENV_API" || echo 0

echo "WEB_ORIGIN:"
grep '^WEB_ORIGIN=' "$ENV_API" || echo "(ausente)"

echo "NCM helper / visão:"
grep '^NCM_HELPER_BASE_URL=' "$ENV_API" || echo "NCM_HELPER_BASE_URL=(ausente)"
grep '^CLASSIFICACAO_NCM_PROVIDER=' "$ENV_API" || echo "CLASSIFICACAO_NCM_PROVIDER=(ausente)"
grep '^CLASSIFICACAO_NCM_VISION=' "$ENV_API" || echo "CLASSIFICACAO_NCM_VISION=(ausente)"

echo -n "CLERK prefix: "
grep -o '^CLERK_SECRET_KEY=sk_[a-z]*_' "$ENV_API" || echo "(ausente)"

echo -n "CLERK length: "
grep '^CLERK_SECRET_KEY=' "$ENV_API" | awk -F= '{print length($2)}' || echo 0
