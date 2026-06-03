/**
 * Cascata de SAÍDA (formação de preço / nota de venda) — validada número por
 * número contra a planilha 66 (aba Sheet1, células A114:E114, e aba Plan1).
 *
 * Fórmulas confirmadas:
 *   markup        = (CIF_BRL + impostosEntrada + outrasDespesasBase) * markup%        // A114
 *   base_saida    = CIF_BRL + impostosEntrada + outrasDespesasBase + markup
 *   venda_liquida = base_saida / (1 - PIS_saida - COFINS_saida - ICMS_saida)          // /0,8675
 *   ICMS_saida    = (venda_liquida / (1 - ICMS_saida)) * ICMS_saida - ICMS_entrada    // E114
 *   DIF_PIS       = (venda_liquida - ICMS_saida) * PIS_saida    - PIS_entrada          // C114
 *   DIF_COFINS    = (venda_liquida - ICMS_saida) * COFINS_saida - COFINS_entrada       // D114
 *   DIF_IPI       = aliqMediaIPI * base_saida - IPI_entrada   (se aliqMediaIPI<=15%)   // B114
 *   CSLL          = markup * 9%                                                        // Plan1 C39
 *   IRRF          = (markup + base_nota * 2,7%) * 25%                                  // Plan1 C40
 *
 * Os DIFs e ICMS de saída têm piso 0 (a planilha usa IF(...>0, ..., "")).
 */

import type {
  CotacaoFiscalInput,
  ItemFiscalResult,
  ParamsSaida,
  ResultadoSaida,
  TotaisEntrada,
} from "./types.js";

/** Alíquota média de IPI ponderada pelo FOB (C112 na planilha 66). */
export function calcAliqMediaIPI(itens: ItemFiscalResult[]): number {
  const fobTotal = itens.reduce((acc, it) => acc + it.fobUS, 0);
  if (fobTotal <= 0) return 0;
  const ponderado = itens.reduce((acc, it) => acc + it.fobUS * it.aliqIPI, 0);
  return ponderado / fobTotal;
}

export function calcSaida(
  cotacao: CotacaoFiscalInput,
  itens: ItemFiscalResult[],
  entrada: TotaisEntrada,
  params: ParamsSaida,
): ResultadoSaida {
  const cifBRL = entrada.cifTotalBRL;
  const impostosEntrada = entrada.impostosEntradaTotal;

  const outrasDespesasBaseBRL =
    cotacao.outrasDespesasBaseBRL ??
    cotacao.despesas
      .filter((d) => d.entraBaseSaida !== false)
      .reduce((acc, d) => acc + d.valorBRL, 0);
  const taxasLocaisTotalBRL = cotacao.despesas.reduce((acc, d) => acc + d.valorBRL, 0);

  const aliqMediaIPI = calcAliqMediaIPI(itens);

  // Markup sobre o custo nacionalizado (CIF + impostos entrada + outras despesas base).
  const markup = (cifBRL + impostosEntrada + outrasDespesasBaseBRL) * params.markupPct;
  const baseSaida = cifBRL + impostosEntrada + outrasDespesasBaseBRL + markup;

  const divisor = 1 - params.pisSaida - params.cofinsSaida - params.icmsSaida;
  const vendaLiquida = baseSaida / divisor;

  const icmsSaidaBruto =
    (vendaLiquida / (1 - params.icmsSaida)) * params.icmsSaida - params.icmsEntrada;
  const icmsSaida = Math.max(0, icmsSaidaBruto);

  const difPISBruto = (vendaLiquida - icmsSaida) * params.pisSaida - entrada.pisTotal;
  const difPIS = Math.max(0, difPISBruto);

  const difCOFINSBruto = (vendaLiquida - icmsSaida) * params.cofinsSaida - entrada.cofinsTotal;
  const difCOFINS = Math.max(0, difCOFINSBruto);

  // DIF IPI: acima do teto de alíquota média, a base exclui PIS/COFINS de entrada.
  const baseIpiAlta =
    cifBRL +
    (impostosEntrada - entrada.ipiTotal - entrada.pisTotal - entrada.cofinsTotal) +
    outrasDespesasBaseBRL +
    markup;
  const baseDifIPI = aliqMediaIPI > params.ipiTetoAliqMedia ? baseIpiAlta : baseSaida;
  const difIPIBruto = aliqMediaIPI * baseDifIPI - entrada.ipiTotal;
  const difIPI = Math.max(0, difIPIBruto);

  const csll = markup * params.csllSobreMarkup;

  // BASE NOTA SAÍDA: CIF + II + antidumping + despesas marcadas (Plan1 J13).
  const despesasBaseNota = cotacao.despesas
    .filter((d) => d.entraBaseNota !== false)
    .reduce((acc, d) => acc + d.valorBRL, 0);
  const baseNotaSaida =
    cifBRL + entrada.iiTotal + entrada.antidumpingBRL + despesasBaseNota;

  const irrf = (markup + baseNotaSaida * params.irrfBaseNotaPct) * params.irrfAliq;

  const impostosSaidaTotal = difIPI + difPIS + difCOFINS + icmsSaida + csll + irrf;

  return {
    outrasDespesasBaseBRL,
    taxasLocaisTotalBRL,
    aliqMediaIPI,
    markup,
    baseSaida,
    vendaLiquida,
    difIPI,
    difPIS,
    difCOFINS,
    icmsSaida,
    csll,
    irrf,
    baseNotaSaida,
    impostosSaidaTotal,
  };
}
