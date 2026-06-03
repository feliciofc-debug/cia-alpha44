/**
 * Cascata de ENTRADA (nacionalização) — validada número por número contra a
 * planilha 66 (aba Sheet1).
 *
 * Fórmulas confirmadas (célula → significado):
 *   frete_kg_global = (adicionaisVA + freteTotal) / pesoLiqTotal      // (D6 + K3) / M3
 *   CIF/kg_item     = FOB_item/peso_item + frete_kg_global            // D8
 *   CIF_item_US     = CIF/kg_item * peso_item
 *   CIF_item_BRL    = CIF_item_US * câmbio
 *   II              = aliqII  * CIF_item_US * câmbio                  // J8
 *   IPI             = aliqIPI * (CIF_item_BRL + II)                   // K8 (base inclui II)
 *   PIS             = aliqPIS * CIF_item_BRL                          // L8
 *   COFINS          = aliqCOFINS * CIF_item_BRL                       // M8
 *
 * ICMS de entrada NÃO compõe a nacionalização (diferido em Alagoas).
 */

import type {
  CotacaoFiscalInput,
  ItemFiscalInput,
  ItemFiscalResult,
  TotaisEntrada,
} from "./types.js";

/** Peso líquido por item; aplica fallback peso_bruto * 0.92 quando não informado. */
export function resolvePesoLiq(pesoLiqInformado?: number, pesoBruto?: number): number {
  if (pesoLiqInformado && pesoLiqInformado > 0) return pesoLiqInformado;
  if (pesoBruto && pesoBruto > 0) return pesoBruto * 0.92;
  return 0;
}

/** Frete global rateado por kg, idêntico para todos os itens da cotação. */
export function calcFreteKgGlobal(
  freteTotalUS: number,
  pesoLiqTotalKg: number,
  adicionaisVaUS = 0,
): number {
  if (pesoLiqTotalKg <= 0) return 0;
  return (adicionaisVaUS + freteTotalUS) / pesoLiqTotalKg;
}

/** Cascata de entrada de um único item. */
export function calcItemEntrada(
  item: ItemFiscalInput,
  freteKgGlobal: number,
  cambio: number,
): ItemFiscalResult {
  const peso = item.pesoLiqKg;
  const fretePartUS = freteKgGlobal * peso;
  const cifItemUS = item.fobUS + fretePartUS;
  const cifKgUS = peso > 0 ? cifItemUS / peso : 0;
  const cifItemBRL = cifItemUS * cambio;

  const ii = item.aliqII * cifItemUS * cambio;
  const ipi = item.aliqIPI * (cifItemBRL + ii);
  const pis = item.aliqPIS * cifItemBRL;
  const cofins = item.aliqCOFINS * cifItemBRL;
  const icmsEntrada = (item.aliqICMSEntrada ?? 0) * cifItemBRL;

  return {
    ref: item.ref,
    ncm: item.ncm,
    fobUS: item.fobUS,
    pesoLiqKg: peso,
    freteKgGlobal,
    cifKgUS,
    cifItemUS,
    cifItemBRL,
    ii,
    ipi,
    pis,
    cofins,
    icmsEntrada,
    aliqII: item.aliqII,
    aliqIPI: item.aliqIPI,
    aliqPIS: item.aliqPIS,
    aliqCOFINS: item.aliqCOFINS,
  };
}

/** Roda a cascata de entrada para todos os itens e retorna itens + totais. */
export function calcEntrada(cotacao: CotacaoFiscalInput): {
  itens: ItemFiscalResult[];
  totais: TotaisEntrada;
} {
  const adicionaisVaUS = cotacao.adicionaisVaUS ?? 0;
  const pesoLiqTotalKg = cotacao.itens.reduce((acc, it) => acc + it.pesoLiqKg, 0);
  const freteKgGlobal = calcFreteKgGlobal(cotacao.freteTotalUS, pesoLiqTotalKg, adicionaisVaUS);

  const itens = cotacao.itens.map((it) => calcItemEntrada(it, freteKgGlobal, cotacao.cambio));

  const fobTotalUS = cotacao.itens.reduce((acc, it) => acc + it.fobUS, 0);
  const iiTotal = itens.reduce((acc, it) => acc + it.ii, 0);
  const ipiTotal = itens.reduce((acc, it) => acc + it.ipi, 0);
  const pisTotal = itens.reduce((acc, it) => acc + it.pis, 0);
  const cofinsTotal = itens.reduce((acc, it) => acc + it.cofins, 0);
  const antidumpingBRL = cotacao.antidumpingBRL ?? 0;

  // CIF total em R$ segue a planilha (Plan1 E13): (FOB + frete) * câmbio.
  const cifTotalBRL = (fobTotalUS + cotacao.freteTotalUS) * cotacao.cambio;

  const impostosEntradaTotal =
    cotacao.siscomex + iiTotal + ipiTotal + pisTotal + cofinsTotal;

  return {
    itens,
    totais: {
      fobTotalUS,
      pesoLiqTotalKg,
      cifTotalBRL,
      iiTotal,
      ipiTotal,
      pisTotal,
      cofinsTotal,
      siscomex: cotacao.siscomex,
      antidumpingBRL,
      impostosEntradaTotal,
    },
  };
}
