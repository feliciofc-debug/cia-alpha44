#!/usr/bin/env bash
# Reclassificação limpa cotação 72 produção (VPS).
# Por padrão: backup + rollback-test + dry-run, SEM gravar.
# Execução real somente com EXECUTE_REAL=1 + CONFIRM_COT72_PROD=<cotacaoId>.
# Requer: DATABASE_URL, CLERK_SECRET_KEY, API com rota dry-run, PROOF_API.
set -euo pipefail
cd "$(dirname "$0")/.."
COT_ID="${1:-cmqlfuhvm000ykw2cue1whldj}"
export COT72_ID="$COT_ID"
export PROOF_API="${PROOF_API:-https://api2.amzofertas.com.br/cia}"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="${COT72_BACKUP_DIR:-/tmp/cot72-backup-${COT_ID}-${STAMP}}"

echo "=== 1) Backup obrigatório cot 72 ==="
MANIFEST="$(node tools/backup-cot72-producao.mjs "$COT_ID" "$BACKUP_DIR" --print-manifest)"
export COT72_BACKUP_MANIFEST="$MANIFEST"
echo "Manifest: $COT72_BACKUP_MANIFEST"

echo ""
echo "=== 2) Teste de rollback em cópia temporária ==="
node tools/test-rollback-cot72-backup.mjs "$COT72_BACKUP_MANIFEST"

echo ""
echo "=== 3) Dry-run reclassificação (sem gravar) ==="
node tools/vps-dry-run-reclassificar-cot72.mjs "$COT_ID"

if [[ "${EXECUTE_REAL:-0}" != "1" ]]; then
  echo ""
  echo "=== PARADO ANTES DA EXECUÇÃO REAL ==="
  echo "Dry-run gerado em: $BACKUP_DIR/dry-run-reclassificar-cot72.md"
  echo "Rollback testado em: $BACKUP_DIR/rollback-test-report.json"
  echo "Para executar de verdade, após revisão humana:"
  echo "  export COT72_BACKUP_MANIFEST=\"$COT72_BACKUP_MANIFEST\""
  echo "  export COT72_FOB_TARGET_MODE=organico   # ou item9-confirmado"
  echo "  export CONFIRM_COT72_PROD=\"$COT_ID\""
  echo "  EXECUTE_REAL=1 bash tools/run-reclassificar-cot72-producao.sh \"$COT_ID\""
  exit 0
fi

: "${CONFIRM_COT72_PROD:?Defina CONFIRM_COT72_PROD=$COT_ID para execução real}"
: "${COT72_FOB_TARGET_MODE:?Defina COT72_FOB_TARGET_MODE=organico ou item9-confirmado}"

echo ""
echo "=== 4) Limpar NCM injetado (patch/legado) ==="
node tools/limpar-ncm-injetado-cot72.mjs "$COT_ID"

echo ""
echo "=== 5) POST /api/cotacoes/$COT_ID/reclassificar ==="
node tools/vps-reclassificar-cotacao.mjs "$COT_ID"

echo ""
echo "=== 6) Prova GET + aceite ampliado ==="
node tools/proof-reclassificar-cot72-producao.mjs "$COT_ID"
