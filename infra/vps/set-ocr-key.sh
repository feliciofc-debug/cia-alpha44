#!/bin/bash
# Define OCR_API_KEY na VPS (OCR.space ou outro).
# Uso: bash /opt/cia-alpha44/infra/vps/set-ocr-key.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "Erro: $ENV_API não existe."
  exit 1
fi

read -r -s -p "Cole a OCR API key: " KEY
echo ""

if [[ -z "$KEY" ]]; then
  echo "Erro: chave vazia."
  exit 1
fi

TMP=$(mktemp)
grep -v '^OCR_PROVIDER=' "$ENV_API" | grep -v '^OCR_API_KEY=' > "$TMP" || true
{
  cat "$TMP"
  echo "OCR_PROVIDER=ocrspace"
  printf 'OCR_API_KEY=%s\n' "$KEY"
  echo "OCR_LANGUAGE=chs"
} > "${TMP}.new"
chmod 600 "${TMP}.new"
mv "${TMP}.new" "$ENV_API"
rm -f "$TMP"

systemctl restart cia-api
sleep 2
echo ">> Meta OCR:"
curl -sf "http://127.0.0.1:3333/api/meta" | grep -o '"ocr[^"]*":[^,}]*' || true
