/**
 * Regra global FOB/kg — planilha operacional IMPORTAÇÕES DA CHINA.
 *
 * Para **cada item** de uma cotação:
 * 1. NCM na planilha China → PREÇO FOB/KG (média DI) para REFERÊNCIA / alerta de desvio
 * 2. FOB total US$ da invoice embarque (fobEmbarqueUS) → base fiscal no motor
 * 3. NCM ausente na planilha → ComexStat só como referência; lacuna sem invoice → pendente
 * 4. Override manual do operador → soberano no motor
 */

import type { Benchmark, Item } from "@cia/shared";
import type { BenchmarkIndex } from "./benchmark.js";
import { lookupBenchmark } from "./benchmark.js";
import { fobKgParaPreenchimento } from "./benchmark-metrics.js";
import { pesoParaBaseFob } from "./detectar-base-peso-fob.js";
import { aplicarRegrasFobItens } from "./resolver-fob-kg.js";

/** NCM tem referência na planilha China carregada (Histórico próprio). */
export function ncmNaPlanilhaChina(benchmark: Benchmark): boolean {
  return benchmark.fonte === "Histórico próprio" && (fobKgParaPreenchimento(benchmark) ?? 0) > 0;
}

export function ncmNaPlanilhaChinaIndex(index: BenchmarkIndex, ncm: string): boolean {
  return ncmNaPlanilhaChina(lookupBenchmark(index, ncm));
}

/**
 * Aplica a regra da planilha China em **todos** os itens da cotação.
 * Idempotente — seguro em upload, recálculo e alteração de NCM.
 */
export function aplicarPlanilhaChinaCotacao(itens: Item[], benchmarkIndex: BenchmarkIndex): Item[] {
  return itens.map((it) => {
    if (it.fobKgManual != null && it.fobKgManual > 0) return it;
    return aplicarRegrasFobItens([it], benchmarkIndex)[0]!;
  });
}

/** Rótulo legível da fonte FOB/kg para relatórios e exportação. */
export function rotuloFonteFobKgItem(it: Item): string {
  if (it.fobPendente) return "FOB pendente";
  if (it.fobKgManual != null && it.fobKgManual > 0) return "Override manual";
  if (it.benchmark?.fonte === "Histórico próprio") {
    return `Planilha China (PREÇO FOB/KG) · ${it.benchmark.rastroFonte ?? "media-DI"}`;
  }
  if (it.benchmark?.fonte === "ComexStat") {
    return `ComexStat (NCM ausente na planilha) · ${it.benchmark.rastroFonte ?? "ponderada"}`;
  }
  if (it.fobKgFonte === "linha") return "Planilha embarque (fornecedor)";
  return it.fobKgFonte ?? "—";
}

/** FOB/kg efetivo para relatório — planilha China > manual > embarque. */
export function fobKgRelatorioItem(it: Item): number | null {
  if (it.fobPendente) return null;
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  const planilha = it.benchmark ? fobKgParaPreenchimento(it.benchmark) : null;
  if (planilha != null && planilha > 0) return planilha;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  const peso = pesoParaBaseFob(it.fobKgBase ?? "liquido", it.pesoBrutoKg, it.pesoLiqKg);
  if (peso > 0 && it.fobTotalUS > 0) return it.fobTotalUS / peso;
  return null;
}
