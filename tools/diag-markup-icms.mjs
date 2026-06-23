import { getState } from "../apps/api/dist/state.js";
import { atualizarCotacao, buscarCotacao } from "../apps/api/dist/services/cotacoes-persist.js";

const id = process.argv[2] ?? "cmqe64woo000ekwyl0ubjsqtd";
const tenant = process.argv[3] ?? "user_user_3F8II5ZMgFqh8AoeSiDI7lXkjdL";
const state = getState();

const antes = await buscarCotacao(id, tenant);
console.log("ICMS antes:", antes.cotacao.params.icmsSaida, "markup BRL:", antes.resultado.saida.markup.toFixed(2));

const r1 = await atualizarCotacao(id, tenant, state, { regimeIcms: "NORMAL", markupPct: 0.08, icmsAuto: true });
console.log("\nPATCH regime NORMAL + markup 8%:");
console.log("  icmsSaida params:", r1.cotacao.params.icmsSaida);
console.log("  icmsSaida BRL:", r1.resultado.saida.icmsSaida.toFixed(2));
console.log("  markup BRL:", r1.resultado.saida.markup.toFixed(2));

const r2 = await atualizarCotacao(id, tenant, state, { regimeIcms: "AL_DIFERIDO", markupPct: 0.06, icmsAuto: true });
console.log("\nPATCH regime AL_DIFERIDO + markup 6%:");
console.log("  icmsSaida params:", r2.cotacao.params.icmsSaida);
console.log("  icmsSaida BRL:", r2.resultado.saida.icmsSaida.toFixed(2));
console.log("  markup BRL:", r2.resultado.saida.markup.toFixed(2));

console.log("\nConclusão: se ICMS muda e markup muda no mesmo PATCH, backend recalcula ambos.");
