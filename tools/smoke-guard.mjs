/**
 * Evita scripts de repro/smoke mutarem cotações usadas para inspeção manual.
 * Uso: import { exigirCotacaoExplicita, exigirMutacaoAutorizada } from "./smoke-guard.mjs";
 */

/** Cotações conhecidas de inspeção/demo — nunca mutar sem sandbox dedicado. */
const COTACOES_PROTEGIDAS = new Set([
  "cmqfu34co000ukwgg6d0e8pcd", // planilha-armadilha (inspeção cliente)
]);

const API_PROD = /amzofertas\.com\.br/i;

export function exigirCotacaoExplicita(cotId, nomeScript) {
  if (cotId?.trim()) return cotId.trim();
  console.error(
    `[${nomeScript}] Informe SMOKE_COT=<id> (ou argumento COTACAO_ID).\n` +
      "  Não há default — evita corromper cotações de inspeção.",
  );
  process.exit(2);
}

/** PATCH/confirmar/lote em prod ou cotação protegida exige opt-in explícito. */
export function exigirMutacaoAutorizada(api, cotId, nomeScript) {
  const prod = API_PROD.test(api ?? "");
  const protegida = COTACOES_PROTEGIDAS.has(cotId);
  if (!process.env.SMOKE_DESTRUCTIVE) {
    if (protegida) {
      console.error(
        `[${nomeScript}] Cotação protegida (${cotId}) — inspeção manual.\n` +
          "  Crie uma cotação sandbox ou defina SMOKE_DESTRUCTIVE=1 sabendo que ALTERA dados.",
      );
      process.exit(2);
    }
    if (prod) {
      console.error(
        `[${nomeScript}] API prod (${api}) com mutação exige SMOKE_DESTRUCTIVE=1 + SMOKE_COT explícito.`,
      );
      process.exit(2);
    }
  }
  if (protegida && process.env.SMOKE_DESTRUCTIVE !== "1") {
    console.error(`[${nomeScript}] Cotação protegida: só com SMOKE_DESTRUCTIVE=1`);
    process.exit(2);
  }
}
