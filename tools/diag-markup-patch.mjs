/**
 * Diagnóstico markup PATCH — simula payload UI (fração) vs percentual (bug hipotético).
 * VPS: source /etc/cia-alpha44/api.env && node tools/diag-markup-patch.mjs [cotacaoId] [tenant]
 */
import { z } from "zod";

const atualizarCotacaoBody = z.object({
  markupPct: z.number().min(0).max(1).optional(),
  regimeIcms: z.enum(["AL_DIFERIDO", "NORMAL"]).optional(),
  params: z.object({ icmsSaida: z.number().optional() }).optional(),
});

const casos = [
  { label: "UI fração 8%", body: { markupPct: 0.08 } },
  { label: "UI percentual 8 (bug hipótese)", body: { markupPct: 8 } },
  { label: "UI fração 12%", body: { markupPct: 0.12 } },
];

console.log("=== Zod atualizarCotacaoBody — markupPct ===\n");
for (const c of casos) {
  const r = atualizarCotacaoBody.safeParse(c.body);
  console.log(`${c.label}: ${r.success ? "OK → " + JSON.stringify(r.data) : "REJEITADO → " + JSON.stringify(r.error.flatten().fieldErrors)}`);
}

const id = process.argv[2];
const tenant = process.argv[3] ?? "felicio";

if (!id) {
  console.log("\n(passe cotacaoId [tenantSlug] para testar atualizarCotacao real)");
  process.exit(0);
}

const { getState } = await import("../apps/api/dist/state.js");
const { atualizarCotacao, buscarCotacao } = await import("../apps/api/dist/services/cotacoes-persist.js");

const state = getState();

const antes = await buscarCotacao(id, tenant);
if (!antes) {
  console.error("Cotação não encontrada:", id, "tenant:", tenant);
  process.exit(1);
}

const mkAntes = antes.resultado?.saida?.markup;
const pctAntes = antes.cotacao.params.markupPct;
console.log(`\n=== Cotação ${id} (tenant ${tenant}) ===`);
console.log(`markupPct params: ${pctAntes} (${(pctAntes * 100).toFixed(2)}%)`);
console.log(`resultado.saida.markup: R$ ${mkAntes?.toFixed(2)}`);

for (const novo of [0.08, 0.15]) {
  const upd = await atualizarCotacao(id, tenant, state, { markupPct: novo });
  const mk = upd?.resultado?.saida?.markup;
  const pct = upd?.cotacao.params.markupPct;
  console.log(`\nPATCH markupPct=${novo} → params=${pct}, markup R$=${mk?.toFixed(2)}, financeiro.markupBRL=${upd?.financeiro?.markupBRL?.toFixed(2)}`);
}

const payloadUi = {
  markupPct: 0.08,
  regimeIcms: "AL_DIFERIDO",
  icmsAuto: true,
  params: { pisSaida: 0.0165, cofinsSaida: 0.076 },
};
console.log("\n=== payloadAtualizar típico (markup 8%) ===");
const zodUi = atualizarCotacaoBody.safeParse(payloadUi);
console.log(zodUi.success ? "Zod OK" : zodUi.error.flatten());

const updUi = await atualizarCotacao(id, tenant, state, payloadUi);
console.log(`Backend aplicou: markupPct=${updUi?.cotacao.params.markupPct}, markup R$=${updUi?.resultado?.saida?.markup?.toFixed(2)}`);

const payloadBug = { ...payloadUi, markupPct: 8 };
console.log("\n=== payload BUG percentual (markupPct: 8) ===");
const zodBug = atualizarCotacaoBody.safeParse(payloadBug);
console.log(zodBug.success ? "Zod OK (inesperado)" : "Zod REJEITA — HTTP 400, markup não atualiza");
