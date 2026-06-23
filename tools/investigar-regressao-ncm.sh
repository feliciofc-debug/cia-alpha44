#!/bin/bash
set -euo pipefail
set -a
source /etc/cia-alpha44/api.env
set +a
cd /opt/cia-alpha44

echo "=== TESTES MOCK (packliste + fatura92 + compat) ==="
npm run test -w @cia/api -- --run classificar-2passes-mock fatura-92-limpa compatibilidade-produto 2>&1 | tail -50

echo ""
echo "=== CACHE P3b: entradas com 00000000 no JSON ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -t -A -c \
  "SELECT COUNT(*) FROM \"ClassificacaoCache\" WHERE resultado::text LIKE '%00000000%';"

echo ""
echo "=== CACHE: ncm top vazio ou 00000000 ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -t -A -c \
  "SELECT COUNT(*) FROM \"ClassificacaoCache\" WHERE COALESCE(resultado->'ncmCandidatos'->0->>'ncm','') IN ('', '00000000') OR jsonb_array_length(COALESCE(resultado->'ncmCandidatos','[]'::jsonb)) = 0;"

echo ""
echo "=== CACHE: total ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -t -A -c \
  "SELECT COUNT(*) FROM \"ClassificacaoCache\";"

echo ""
echo "=== CACHE: Stossdaempfer samples ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -c \
  "SELECT left(chave,16) AS chave, resultado->'ncmCandidatos'->0->>'ncm' AS ncm_top, left(resultado->>'descPt',50) AS desc_pt, \"hitCount\", \"confirmadoHumano\" FROM \"ClassificacaoCache\" WHERE resultado::text ILIKE '%Sto%' AND resultado::text ILIKE '%mpfer%' LIMIT 8;"

echo ""
echo "=== CACHE: patinete/scooter samples ==="
docker exec cia-postgres psql -U cia_app -d cia_alpha44 -c \
  "SELECT left(chave,16) AS chave, resultado->'ncmCandidatos'->0->>'ncm' AS ncm_top, left(resultado->>'descPt',50) AS desc_pt FROM \"ClassificacaoCache\" WHERE resultado::text ILIKE '%patinete%' OR resultado::text ILIKE '%scooter%' OR resultado::text ILIKE '%Elektroroller%' LIMIT 8;"

echo ""
echo "=== COMPAT: juiz camadas (node) ==="
node --input-type=module <<'NODE'
import { criarNcmCatalog, loadNcmVigente } from '@cia/pipeline';
import { avaliarCompatibilidadeProduto } from './apps/api/dist/siscomex/compatibilidade-produto.js';

const catalog = criarNcmCatalog(loadNcmVigente());

const casos = [
  { label: 'patinete 87116000', desc: 'Patinete elétrico 500W scooter', ncm: '87116000' },
  { label: 'patinete x 8714', desc: 'Patinete elétrico 500W scooter', ncm: '87141000' },
  { label: 'amortecedor 87141000', desc: 'Amortecedor para patinete/scooter elétrico', ncm: '87141000' },
  { label: 'amortecedor x 00000000', desc: 'Amortecedor para patinete/scooter elétrico', ncm: '00000000' },
  { label: 'Stossdaempfer DE-AT-6001 x 87149990', desc: 'Stoßdämpfer hinten für Elektroroller, Ersatzteil', ncm: '87149990' },
  { label: 'amortecedor x 82119320', desc: 'Amortecedor dianteiro patinete elétrico', ncm: '82119320' },
];

for (const c of casos) {
  const { resultado, precisaLlm } = avaliarCompatibilidadeProduto(catalog, {
    descricao: c.desc,
    descricaoFamilia: c.desc,
    ncm: c.ncm,
    material: '铁',
  });
  console.log(`${c.label}: ${resultado.compatibilidadeProduto} | camada=${resultado.camada} | llm=${precisaLlm}`);
  console.log(`  motivo: ${resultado.motivoCompatibilidade.slice(0,120)}`);
}
NODE

echo ""
echo "=== PRODUCAO REAL: packliste-DE classify (montarItens, bypass HTTP) ==="
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs';
import { parseSupplierFile } from '@cia/pipeline';
import { getState } from './apps/api/dist/state.js';
import { montarItens } from './apps/api/dist/services/cotacao.js';

const GABARITO = [
  '84','82','96','73','85','85','94','94','87','95','87','73','63','61'
];
const fixture = 'packages/pipeline/test/fixtures/packliste-DE-2026-0815.xlsx';
const buf = readFileSync(fixture);
const parsed = parseSupplierFile(new Uint8Array(buf));
const state = getState();
const t0 = Date.now();
const { itens, provider, classificacaoCache } = await montarItens(parsed.linhas, state);
const ms = Date.now() - t0;
console.log('provider:', provider);
console.log('cache:', classificacaoCache);
console.log('latencia_ms:', ms);
let acertos = 0;
let zeros = 0;
for (let i = 0; i < GABARITO.length; i++) {
  const it = itens[i];
  const ncm = (it?.ncm || '').padStart(8,'0');
  const cap = ncm.slice(0,2);
  const ok = cap === GABARITO[i];
  if (ok) acertos++;
  if (!it?.ncm || ncm === '00000000') zeros++;
  const compat = it?.compatibilidadeProduto ?? '-';
  console.log(`${String(i+1).padStart(2)} ${ok?'OK':'FAIL'} cap=${cap} ncm=${ncm||'(vazio)'} esp=${GABARITO[i]} compat=${compat} | ${(it?.descOriginal||'').slice(0,45)}`);
}
console.log(`\nAcertos capítulo: ${acertos}/14 | ncm vazio/00000000: ${zeros}`);
const stoss = itens[10];
console.log(`\nStoßdämpfer item 11: ncm=${stoss?.ncm} pos=${(stoss?.ncm||'').slice(0,4)} fonte=${stoss?.ncmFonte} conf=${stoss?.ncmConfianca}`);
NODE
