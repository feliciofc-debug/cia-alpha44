#!/bin/bash
# Atualiza WEB_ORIGIN em /etc/cia-alpha44/api.env (valor público, sem segredo).
# Uso:
#   bash set-web-origin.sh 'https://cia-alpha44.vercel.app,http://localhost:5173'

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"
ORIGIN="${1:-}"

if [[ ! -f "$ENV_API" ]]; then
  echo "Erro: $ENV_API não existe."
  exit 1
fi

if [[ -z "$ORIGIN" ]]; then
  echo "Uso: bash set-web-origin.sh 'https://app.vercel.app,http://localhost:5173'"
  exit 1
fi

ORIGIN_CLEAN=$(printf '%s' "$ORIGIN" | tr -d '\r\n')

TMP=$(mktemp)
grep -v '^WEB_ORIGIN=' "$ENV_API" > "$TMP"
printf 'WEB_ORIGIN=%s\n' "$ORIGIN_CLEAN" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_API"

echo "OK — WEB_ORIGIN=$ORIGIN_CLEAN"
