/**
 * Motor fiscal CIA / Alpha 44 — ponto de entrada.
 *
 * `calcCotacao` roda a cascata completa: entrada (nacionalização) → saída
 * (formação de preço) → total global. Reproduz fielmente a planilha 66.
 */

import { calcEntrada } from "./entrada.js";
import { calcSaida } from "./saida.js";
import { PARAMS_SAIDA_PADRAO } from "./types.js";
import type { CotacaoFiscalInput, ResultadoCotacao } from "./types.js";

export * from "./types.js";
export {
  calcEntrada,
  calcItemEntrada,
  calcFreteKgGlobal,
  resolvePesoLiq,
} from "./entrada.js";
export { calcSaida, calcAliqMediaIPI } from "./saida.js";

export function calcCotacao(cotacao: CotacaoFiscalInput): ResultadoCotacao {
  const params = cotacao.params ?? PARAMS_SAIDA_PADRAO;
  const { itens, totais } = calcEntrada(cotacao);
  const saida = calcSaida(cotacao, itens, totais, params);

  // TOTAL = impostos entrada (+ antidumping) + taxas locais + impostos saída + markup.
  const totalBRL =
    totais.impostosEntradaTotal +
    totais.antidumpingBRL +
    saida.taxasLocaisTotalBRL +
    saida.impostosSaidaTotal +
    saida.markup;

  const totalUS = cotacao.cambio > 0 ? totalBRL / cotacao.cambio : 0;

  return {
    cambio: cotacao.cambio,
    itens,
    entrada: totais,
    saida,
    totalBRL,
    totalUS,
  };
}
