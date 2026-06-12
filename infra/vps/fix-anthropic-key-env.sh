#!/bin/bash
# Corrige ANTHROPIC_API_KEY em api.env — CRLF, whitespace e 'n' órfão após AA.
# Uso: bash /opt/cia-alpha44/infra/vps/fix-anthropic-key-env.sh

set -euo pipefail

ENV_API="/etc/cia-alpha44/api.env"

if [[ ! -f "$ENV_API" ]]; then
  echo "Erro: $ENV_API não existe."
  exit 1
fi

LINE=$(grep '^ANTHROPIC_API_KEY=' "$ENV_API" || true)
if [[ -z "$LINE" ]]; then
  echo "Erro: ANTHROPIC_API_KEY não encontrada."
  exit 1
fi

KEY=$(printf '%s' "${LINE#ANTHROPIC_API_KEY=}" | tr -d '\r\n\t ')
BEFORE=${#KEY}

# Corrupção conhecida: ...AA + CR + 'n' → limparChaveApi deixa ...AAn (109 chars)
if [[ $BEFORE -eq 109 && "${KEY: -1}" == "n" && "${KEY: -3:2}" == "AA" ]]; then
  KEY="${KEY%?}"
fi

AFTER=${#KEY}

TMP=$(mktemp)
grep -v '^ANTHROPIC_API_KEY=' "$ENV_API" > "$TMP"
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$ENV_API"

systemctl restart cia-api
sleep 2

echo ">> Chave reparada: len $BEFORE → $AFTER (esperado 108)"
echo ">> Validação (sem expor chave):"
set -a
# shellcheck disable=SC1091
source "$ENV_API"
set +a
cd /opt/cia-alpha44
node tools/diag-anthropic-vps.mjs
