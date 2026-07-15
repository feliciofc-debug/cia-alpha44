#!/bin/bash
# Valida api.env antes do deploy (não vaza segredos).
# Uso: bash /opt/cia-alpha44/infra/vps/validate-api-env.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "ERRO: $ENV_API não existe"
  exit 1
fi

echo "=== validate-api-env ==="
echo -n "CIA_JWT_SECRET definido: "
grep -c '^CIA_JWT_SECRET=.' "$ENV_API" || echo 0

echo -n "CIA_USERS entradas (vírgulas+1): "
grep '^CIA_USERS=' "$ENV_API" | awk -F= '{gsub(/[^,]/,"",$2); print length($2)+1}' || echo 0

echo -n "CRLF count: "
grep -c $'\r' "$ENV_API" || echo 0

echo "WEB_ORIGIN:"
grep '^WEB_ORIGIN=' "$ENV_API" || echo "(ausente)"

echo "NCM helper / visão:"
grep '^NCM_HELPER_BASE_URL=' "$ENV_API" || echo "NCM_HELPER_BASE_URL=(ausente)"
grep '^CLASSIFICACAO_NCM_PROVIDER=' "$ENV_API" || echo "CLASSIFICACAO_NCM_PROVIDER=(ausente)"
grep '^CLASSIFICACAO_NCM_VISION=' "$ENV_API" || echo "CLASSIFICACAO_NCM_VISION=(ausente)"

echo -n "CIA_API_KEY definido: "
grep -c '^CIA_API_KEY=.' "$ENV_API" || echo 0
