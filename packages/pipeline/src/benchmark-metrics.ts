/** Helpers — métricas duplas FOB/kg (média DI vs ponderada). */

import type { Benchmark } from "@cia/shared";

export const AVISO_BENCHMARK_SO_PONDERADA =
  "benchmark ponderado por volume — referência fraca para DI individual";

/** Referência primária para calibrador/risco — nunca a ponderada. */
export function referenciaPrimariaBenchmark(b: Benchmark): number | null {
  return b.fobKgMedioDI ?? null;
}

export function benchmarkSoPonderado(b: Benchmark): boolean {
  return b.fonte === "ComexStat" && !b.fobKgMedioDI && (b.fobKgPonderado ?? 0) > 0;
}

/** FOB/kg para preenchimento de lacuna (pode usar ponderada com aviso). */
export function fobKgParaPreenchimento(b: Benchmark): number | null {
  return referenciaPrimariaBenchmark(b) ?? b.fobKgPonderado ?? b.mediaFobKg ?? null;
}

/** Rótulo de período real dos dados (ex.: 2023-S1, 2024-07..2025-06). */
export function periodoLabel(periodoDe: string, periodoAte: string): string {
  const y1 = periodoDe.slice(0, 4);
  const m1 = Number.parseInt(periodoDe.slice(5, 7), 10);
  const y2 = periodoAte.slice(0, 4);
  const m2 = Number.parseInt(periodoAte.slice(5, 7), 10);
  if (y1 === y2 && m1 === 1 && m2 === 6) return `${y1}-S1`;
  if (y1 === y2 && m1 === 7 && m2 === 12) return `${y1}-S2`;
  return `${periodoDe}..${periodoAte}`;
}

/** Últimos N meses fechados (exclui mês corrente). */
export function filtrosUltimosMesesFechados(
  nMeses = 12,
  paisId = 160,
  viaId = "01",
): { paisId: number; viaId: string; periodoDe: string; periodoAte: string } {
  const hoje = new Date();
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const inicio = new Date(fim.getFullYear(), fim.getMonth() - (nMeses - 1), 1);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  return { paisId, viaId, periodoDe: fmt(inicio), periodoAte: fmt(fim) };
}
