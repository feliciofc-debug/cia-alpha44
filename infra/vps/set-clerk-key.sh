#!/bin/bash
# Grava CLERK_SECRET_KEY em /etc/cia-alpha44/api.env sem CRLF/espaços.
# Uso (na VPS, interativo — NÃO cole a key no chat/Cursor):
#   bash /opt/cia-alpha44/infra/vps/set-clerk-key.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "Erro: $ENV_API não existe. Rode deploy-api.sh antes."
  exit 1
fi

read -r -s -p "Cole CLERK_SECRET_KEY (sk_test_... ou sk_live_...): " KEY
echo ""

if [[ -z "$KEY" ]]; then
  echo "Erro: chave vazia."
  exit 1
fi

KEY_CLEAN=$(printf '%s' "$KEY" | tr -d '\r\n\t ')

if [[ ! "$KEY_CLEAN" =~ ^sk_(test|live)_ ]]; then
  echo "Aviso: prefixo esperado sk_test_ ou sk_live_ — verifique a chave."
fi

TMP=$(mktemp)
grep -v '^CLERK_SECRET_KEY=' "$ENV_API" > "$TMP"
printf 'CLERK_SECRET_KEY=%s\n' "$KEY_CLEAN" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_API"

echo "OK — CLERK_SECRET_KEY gravada ($(printf '%s' "$KEY_CLEAN" | wc -c) chars, sem CRLF)."
echo "NÃO reinicia a API — aguarde validação + deploy-api.sh."
