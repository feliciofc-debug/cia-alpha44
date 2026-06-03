/**
 * Lookup de benchmark FOB/KG (ComexStat seed + histórico próprio).
 * Regra 8: sem base → "sem base", nunca finge validação.
 */

import type { Benchmark, FonteBenchmark } from "@cia/shared";
import { formatNcm } from "@cia/shared";
import comexstatData from "./data/comexstat-china-2023s1.json" with { type: "json" };

export interface ComexStatEntry {
  ncm: string;
  desc: string;
  fobKg: number;
  cifKg: number;
  amostra: number;
}

export interface ComexSeed {
  fonte: string;
  contexto: string;
  geradoEm: string;
  total: number;
  itens: ComexStatEntry[];
}

export interface HistoricoEntry {
  ncm: string;
  fobKg: number;
  amostra: number;
}

const comexstatIndex = new Map<string, ComexStatEntry>();
for (const row of comexstatData.itens as ComexStatEntry[]) {
  comexstatIndex.set(row.ncm, row);
}

/** Índice em memória do histórico próprio (regra 7 — prioridade sobre ComexStat). */
const historicoIndex = new Map<string, HistoricoEntry>();

export function registrarHistorico(entries: HistoricoEntry[]): void {
  for (const e of entries) {
    const ncm = normalizarNcm(e.ncm);
    const prev = historicoIndex.get(ncm);
    if (!prev || e.amostra >= prev.amostra) {
      historicoIndex.set(ncm, { ncm, fobKg: e.fobKg, amostra: e.amostra });
    }
  }
}

export function normalizarNcm(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/**
 * Piso defensável heurístico a partir da média ComexStat.
 * Sem percentis reais na base → desvio conservador por tamanho de amostra.
 */
export function calcPisoDefensavel(mediaFobKg: number, amostra: number): number {
  if (mediaFobKg <= 0) return 0;
  const fator =
    amostra >= 20 ? 0.75 : amostra >= 10 ? 0.7 : amostra >= 5 ? 0.65 : 0.6;
  return mediaFobKg * fator;
}

export function calcTetoHeuristico(mediaFobKg: number, amostra: number): number {
  if (mediaFobKg <= 0) return 0;
  const fator =
    amostra >= 20 ? 1.35 : amostra >= 10 ? 1.4 : amostra >= 5 ? 1.45 : 1.5;
  return mediaFobKg * fator;
}

export function lookupBenchmark(ncm: string): Benchmark {
  const key = normalizarNcm(ncm);

  const hist = historicoIndex.get(key);
  if (hist && hist.fobKg > 0) {
    const piso = calcPisoDefensavel(hist.fobKg, hist.amostra);
    const teto = calcTetoHeuristico(hist.fobKg, hist.amostra);
    return {
      fonte: "Histórico próprio",
      mediaFobKg: hist.fobKg,
      pisoDefensavel: piso,
      teto,
      amostra: hist.amostra,
      nota: `Benchmark do histórico próprio (${hist.amostra} ref.) · NCM ${formatNcm(key)}`,
    };
  }

  const cs = comexstatIndex.get(key);
  if (cs && cs.fobKg > 0) {
    const piso = calcPisoDefensavel(cs.fobKg, cs.amostra);
    const teto = calcTetoHeuristico(cs.fobKg, cs.amostra);
    return {
      fonte: "ComexStat",
      mediaFobKg: cs.fobKg,
      pisoDefensavel: piso,
      teto,
      amostra: cs.amostra,
      nota: `ComexStat — ${comexstatData.contexto} · ${cs.amostra} DI(s) · média US$ ${cs.fobKg.toFixed(4)}/kg`,
    };
  }

  return {
    fonte: "sem base",
    mediaFobKg: null,
    pisoDefensavel: null,
    teto: null,
    amostra: 0,
    nota: `Sem benchmark carregado para NCM ${formatNcm(key)} — calibragem por classe/heurística`,
  };
}

export function getComexStatStats(): { total: number; contexto: string } {
  return { total: comexstatIndex.size, contexto: comexstatData.contexto };
}
