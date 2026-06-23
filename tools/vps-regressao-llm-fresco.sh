#!/bin/bash
set -eu
cd /opt/cia-alpha44
set -a
source /etc/cia-alpha44/api.env
set +a

echo "=== Limpando cache packliste-DE ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -c "DELETE FROM \"ClassificacaoCache\" WHERE resultado::text ILIKE '%DE-WZ-1001%' OR resultado::text ILIKE '%Kochtopf-Set%' OR resultado::text ILIKE '%Kinderroller%' OR resultado::text ILIKE '%Stossdaempfer%' OR resultado::text ILIKE '%Elektroroller%';"

echo ""
echo "=== REGRESSAO LLM FRESCO (--cold) ==="
node tools/regressao-ncm-fase2.mjs --cold

echo ""
echo "=== SPOT industrial (pipeline P1) ==="
node tools/diag-industrial-de.mjs 2>&1 | tail -40

echo ""
echo "=== SMOKE health ==="
curl -sf http://127.0.0.1:3333/api/health && echo ""
