/** Upload e recarga da planilha mensal FOB/kg (referência operacional INNOVE). */

import {
  benchmarkPlanilhaStats,
  buildBenchmarkIndex,
  defaultBenchmarkPlanilhaPath,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  parseBenchmarkPlanilhaBuffer,
  saveBenchmarkPlanilha,
  substituirHistoricoBenchmark,
  type BenchmarkPlanilhaSeed,
} from "@cia/pipeline";
import type { AppState } from "../state.js";

export function benchmarkPlanilhaPath(): string {
  return process.env.BENCHMARK_PLANILHA_PATH ?? defaultBenchmarkPlanilhaPath();
}

export function statusBenchmarkPlanilha() {
  const seed = loadBenchmarkPlanilha(benchmarkPlanilhaPath());
  const stats = benchmarkPlanilhaStats(seed);
  return {
    ...stats,
    path: process.env.BENCHMARK_PLANILHA_PATH ? "(configurado via env)" : "data/benchmark-fob-kg-innove.json",
    prioridade: "Histórico próprio — prevalece sobre ComexStat nas cotações",
  };
}

function aplicarSeed(state: AppState, seed: BenchmarkPlanilhaSeed) {
  substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  state.benchmarkIndex = buildBenchmarkIndex(state.comexSeed);
}

export function recarregarBenchmarkPlanilha(state: AppState): BenchmarkPlanilhaSeed | null {
  const seed = loadBenchmarkPlanilha(benchmarkPlanilhaPath());
  if (!seed?.itens.length) return null;
  aplicarSeed(state, seed);
  return seed;
}

export async function importarBenchmarkPlanilha(
  state: AppState,
  bytes: Uint8Array,
  filename: string,
): Promise<BenchmarkPlanilhaSeed> {
  const seed = parseBenchmarkPlanilhaBuffer(bytes, filename);
  saveBenchmarkPlanilha(seed, benchmarkPlanilhaPath());
  aplicarSeed(state, seed);
  return seed;
}
