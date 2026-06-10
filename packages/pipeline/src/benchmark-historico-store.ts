/** Persistência da planilha mensal FOB/kg (histórico próprio — prioridade sobre ComexStat). */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { BenchmarkPlanilhaSeed } from "./benchmark-planilha.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Caminho padrão — sobrescrevível via BENCHMARK_PLANILHA_PATH na API. */
export function defaultBenchmarkPlanilhaPath(): string {
  return join(here, "data", "benchmark-fob-kg-innove.json");
}

export function loadBenchmarkPlanilha(path = defaultBenchmarkPlanilhaPath()): BenchmarkPlanilhaSeed | null {
  if (!existsSync(path)) return null;
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as BenchmarkPlanilhaSeed;
}

export function saveBenchmarkPlanilha(seed: BenchmarkPlanilhaSeed, path = defaultBenchmarkPlanilhaPath()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(seed), "utf8");
}

export function benchmarkPlanilhaStats(seed: BenchmarkPlanilhaSeed | null) {
  if (!seed) {
    return {
      carregado: false,
      total: 0,
      arquivo: null as string | null,
      atualizadoEm: null as string | null,
      contexto: null as string | null,
    };
  }
  return {
    carregado: true,
    total: seed.total,
    arquivo: seed.arquivo,
    atualizadoEm: seed.atualizadoEm,
    contexto: seed.contexto,
    fonte: seed.fonte,
  };
}
