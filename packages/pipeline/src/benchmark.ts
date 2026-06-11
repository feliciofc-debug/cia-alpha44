/**
 * Lookup de benchmark FOB/KG (ComexStat seed + histórico próprio).
 * Regra 8: sem base → "sem base", nunca finge validação.
 * Métricas duplas: fobKgMedioDI (primária) · fobKgPonderado (secundária).
 */

import type { Benchmark, FonteBenchmark } from "@cia/shared";
import { formatNcm } from "@cia/shared";
import comexstatData from "./data/comexstat-china-2023s1.json" with { type: "json" };
import { AVISO_BENCHMARK_SO_PONDERADA, periodoLabel } from "./benchmark-metrics.js";

export interface ComexStatEntry {
  ncm: string;
  desc: string;
  fobKg: number;
  cifKg: number;
  amostra: number;
}

/** Alias usado pela API e pelo mock LLM. */
export type ComexEntry = ComexStatEntry;

export interface BenchmarkIndex {
  comex: Map<string, ComexStatEntry>;
  historico: Map<string, HistoricoEntry>;
  contexto: string;
  /** Período real da planilha mensal (ex.: 2023-S1). */
  planilhaPeriodo?: string | null;
  /** Período real ComexStat (ex.: 2023-S1 ou 2024-07..2025-06). */
  comexstatPeriodo?: string | null;
  /** @deprecated use planilhaPeriodo */
  planilhaMensalMes?: string | null;
  /** @deprecated use comexstatPeriodo */
  comexstatMes?: string | null;
}

export interface ComexSeed {
  fonte: string;
  contexto: string;
  geradoEm: string;
  total: number;
  itens: ComexStatEntry[];
  periodoDe?: string;
  periodoAte?: string;
  periodoReferencia?: string;
}

export interface HistoricoEntry {
  ncm: string;
  /** Col 3 — média simples por DI (primária). */
  fobKgMedioDI?: number;
  /** Col 4 / complemento — média ponderada FOB/KG. */
  fobKgPonderado?: number | null;
  /** @deprecated alias de fobKgMedioDI */
  fobKg?: number;
  amostra: number;
}

const comexstatIndex = new Map<string, ComexStatEntry>();
for (const row of comexstatData.itens as ComexStatEntry[]) {
  comexstatIndex.set(row.ncm, row);
}

const DEFAULT_COMEX_PERIODO =
  (comexstatData as ComexSeed).periodoReferencia ?? periodoLabel("2023-01", "2023-06");

/** Índice em memória do histórico próprio (regra 7 — prioridade sobre ComexStat). */
const historicoIndex = new Map<string, HistoricoEntry>();

function entryMedioDI(e: HistoricoEntry): number | null {
  const v = e.fobKgMedioDI ?? e.fobKg ?? null;
  return v != null && v > 0 ? v : null;
}

export function registrarHistorico(entries: HistoricoEntry[]): void {
  for (const e of entries) {
    const ncm = normalizarNcm(e.ncm);
    const prev = historicoIndex.get(ncm);
    if (!prev || e.amostra >= prev.amostra) {
      historicoIndex.set(ncm, {
        ncm,
        fobKgMedioDI: entryMedioDI(e) ?? undefined,
        fobKgPonderado: e.fobKgPonderado ?? null,
        fobKg: entryMedioDI(e) ?? undefined,
        amostra: e.amostra,
      });
    }
  }
}

/** Substitui todo o histórico operacional (planilha mensual FOB/kg). */
export function substituirHistoricoBenchmark(entries: HistoricoEntry[]): void {
  historicoIndex.clear();
  for (const e of entries) {
    const ncm = normalizarNcm(e.ncm);
    const medioDI = entryMedioDI(e);
    if (!ncm || ncm === "00000000" || !medioDI) continue;
    historicoIndex.set(ncm, {
      ncm,
      fobKgMedioDI: medioDI,
      fobKgPonderado: e.fobKgPonderado ?? null,
      fobKg: medioDI,
      amostra: e.amostra > 0 ? e.amostra : 1,
    });
  }
}

export function getHistoricoBenchmarkStats(): { total: number } {
  return { total: historicoIndex.size };
}

export function normalizarNcm(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/** Piso defensável — só sobre média DI (nunca ponderada). */
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

export function extrairMesReferencia(isoOuContexto: string): string {
  const iso = isoOuContexto.match(/^(\d{4}-\d{2})/);
  if (iso) return iso[1]!;
  const ano = isoOuContexto.match(/(\d{4})/)?.[1] ?? "2023";
  if (/2º|2o|segundo|s2|2nd/i.test(isoOuContexto)) return `${ano}-12`;
  if (/1º|1o|primeiro|s1|1st/i.test(isoOuContexto)) return `${ano}-06`;
  return `${ano}-06`;
}

interface BenchmarkMeta {
  planilhaPeriodo?: string | null;
  comexstatPeriodo?: string | null;
}

/** Monta índice em memória a partir do seed carregado (API). */
export function buildBenchmarkIndex(
  itens: ComexStatEntry[],
  contexto = comexstatData.contexto,
  meta?: BenchmarkMeta & { planilhaMensalMes?: string | null },
): BenchmarkIndex {
  const comex = new Map<string, ComexStatEntry>();
  for (const row of itens) {
    comex.set(normalizarNcm(row.ncm), row);
  }
  const comexstatPeriodo = meta?.comexstatPeriodo ?? DEFAULT_COMEX_PERIODO;
  const planilhaPeriodo = meta?.planilhaPeriodo ?? meta?.planilhaMensalMes ?? null;
  return {
    comex,
    historico: new Map(historicoIndex),
    contexto,
    planilhaPeriodo,
    comexstatPeriodo,
    planilhaMensalMes: planilhaPeriodo,
    comexstatMes: extrairMesReferencia(comexstatPeriodo),
  };
}

function lookupFromMaps(
  key: string,
  comex: Map<string, ComexStatEntry>,
  historico: Map<string, HistoricoEntry>,
  contexto: string,
  meta: BenchmarkMeta = {},
): Benchmark {
  const hist = historico.get(key);
  const cs = comex.get(key);
  const periodoPlanilha = meta.planilhaPeriodo ?? "referencia";
  const periodoComex = meta.comexstatPeriodo ?? DEFAULT_COMEX_PERIODO;

  if (hist) {
    const medioDI = entryMedioDI(hist);
    if (medioDI) {
      const ponderado = hist.fobKgPonderado ?? cs?.fobKg ?? null;
      const piso = calcPisoDefensavel(medioDI, hist.amostra);
      const teto = calcTetoHeuristico(medioDI, hist.amostra);
      const notaPond =
        ponderado != null
          ? ` · ponderado US$ ${ponderado.toFixed(4)}/kg`
          : "";
      return {
        fonte: "Histórico próprio",
        fobKgMedioDI: medioDI,
        fobKgPonderado: ponderado,
        mediaFobKg: medioDI,
        pisoDefensavel: piso,
        teto,
        amostra: hist.amostra,
        amostraDIs: hist.amostra,
        rastroFonte: `planilha-mensal(${periodoPlanilha}):media-DI`,
        nota: `Média DI US$ ${medioDI.toFixed(4)}/kg (${hist.amostra} ref.)${notaPond} · NCM ${formatNcm(key)}`,
      };
    }
  }

  if (cs && cs.fobKg > 0) {
    return {
      fonte: "ComexStat",
      fobKgMedioDI: null,
      fobKgPonderado: cs.fobKg,
      mediaFobKg: null,
      pisoDefensavel: null,
      teto: null,
      amostra: cs.amostra,
      rastroFonte: `comexstat(${periodoComex}):ponderada`,
      avisoBenchmark: AVISO_BENCHMARK_SO_PONDERADA,
      nota: `ComexStat ponderado US$ ${cs.fobKg.toFixed(4)}/kg · ${contexto} · NCM ${formatNcm(key)}`,
    };
  }

  return {
    fonte: "sem base",
    fobKgMedioDI: null,
    fobKgPonderado: null,
    mediaFobKg: null,
    pisoDefensavel: null,
    teto: null,
    amostra: 0,
    nota: `Sem benchmark carregado para NCM ${formatNcm(key)} — calibragem por classe/heurística`,
  };
}

export function lookupBenchmark(index: BenchmarkIndex, ncm: string): Benchmark;
export function lookupBenchmark(ncm: string): Benchmark;
export function lookupBenchmark(
  indexOrNcm: BenchmarkIndex | string,
  ncm?: string,
): Benchmark {
  if (typeof indexOrNcm === "string") {
    return lookupFromMaps(
      normalizarNcm(indexOrNcm),
      comexstatIndex,
      historicoIndex,
      comexstatData.contexto,
      { comexstatPeriodo: DEFAULT_COMEX_PERIODO },
    );
  }
  return lookupFromMaps(normalizarNcm(ncm ?? ""), indexOrNcm.comex, indexOrNcm.historico, indexOrNcm.contexto, {
    planilhaPeriodo: indexOrNcm.planilhaPeriodo ?? indexOrNcm.planilhaMensalMes,
    comexstatPeriodo: indexOrNcm.comexstatPeriodo ?? DEFAULT_COMEX_PERIODO,
  });
}

export function getComexStatStats(): { total: number; contexto: string } {
  return { total: comexstatIndex.size, contexto: comexstatData.contexto };
}
