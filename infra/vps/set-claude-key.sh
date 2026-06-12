#!/bin/bash
# Define ANTHROPIC_API_KEY na VPS sem expor no chat/histórico do shell.
# Uso: bash /opt/cia-alpha44/infra/vps/set-claude-key.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "Erro: $ENV_API não existe. Rode deploy-api.sh antes."
  exit 1
fi

read -r -s -p "Cole a API key Claude (sk-ant-...): " KEY
echo ""

if [[ -z "$KEY" ]]; then
  echo "Erro: chave vazia."
  exit 1
fi

TMP=$(mktemp)
grep -v '^ANTHROPIC_API_KEY=' "$ENV_API" > "$TMP"
# Remove whitespace acidental (CRLF, newline no meio da chave)
KEY_CLEAN=$(printf '%s' "$KEY" | tr -d '\r\n\t ')
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY_CLEAN" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_API"

systemctl restart cia-api
sleep 2

echo ">> Meta (llmDisponivel deve ser true):"
curl -sf "http://127.0.0.1:3333/api/meta" || echo "API ainda subindo — aguarde e rode: curl http://127.0.0.1:3333/api/meta"
