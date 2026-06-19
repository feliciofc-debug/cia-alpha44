/**
 * Regra global FOB/kg — planilha operacional IMPORTAÇÕES DA CHINA.
 *
 * Para **cada item** de uma cotação:
 * 1. NCM na planilha China → PREÇO FOB/KG (média DI) — prevalece sobre embarque
 * 2. NCM ausente na planilha → ComexStat (NCM mais próximo)
 * 3. Override manual do operador → soberano
 */

import type { Benchmark, Item } from "@cia/shared";
import type { BenchmarkIndex } from "./benchmark.js";
import { lookupBenchmark } from "./benchmark.js";
import { fobKgParaPreenchimento } from "./benchmark-metrics.js";
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
