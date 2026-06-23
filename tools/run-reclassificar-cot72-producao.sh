#!/usr/bin/env bash
# Reclassificação limpa cotação 72 produção (VPS).
# Requer: DATABASE_URL, CLERK_SECRET_KEY, API rodando local ou PROOF_API.
set -euo pipefail
cd "$(dirname "$0")/.."
COT_ID="${1:-cmqlfuhvm000ykw2cue1whldj}"
export COT72_ID="$COT_ID"
export PROOF_API="${PROOF_API:-https://api2.amzofertas.com.br/cia}"

echo "=== 1) Limpar NCM injetado (patch/legado) ==="
node tools/limpar-ncm-injetado-cot72.mjs "$COT_ID"

echo ""
echo "=== 2) POST /api/cotacoes/$COT_ID/reclassificar ==="
node tools/vps-reclassificar-cotacao.mjs "$COT_ID"

echo ""
echo "=== 3) Prova GET + aceite ==="
node tools/proof-reclassificar-cot72-producao.mjs "$COT_ID"
