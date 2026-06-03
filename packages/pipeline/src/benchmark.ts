/**
 * Benchmark FOB/KG a partir do ComexStat (regra 6) e do histórico próprio (regra 7).
 *
 * Honestidade (regra 8): o export ComexStat disponível traz a MÉDIA de FOB/KG por
 * NCM (não a distribuição P10/P25/mediana). Portanto:
 *  - `mediaFobKg` é o dado real observado.
 *  - `pisoDefensavel` é uma HEURÍSTICA derivada da média (não um percentil real),
 *    rotulada como tal na `nota`.
 *  - quando não há base para o NCM, retornamos fonte "sem base" — nunca fingimos
 *    validação.
 */

import type { Benchmark, FonteBenchmark } from "@cia/shared";

export interface ComexEntry {
  ncm: string;
  desc: string;
  /** Média de FOB/KG observada (US$/kg). */
  fobKg: number;
  /** Média de CIF/KG observada (US$/kg). */
  cifKg: number;
  /** Tamanho da amostra (nº de DIs). */
  amostra: number;
}

export interface ComexSeed {
  fonte: string;
  contexto: string;
  geradoEm: string;
  total: number;
  itens: ComexEntry[];
}

export type BenchmarkIndex = Map<string, ComexEntry>;

function normNcm(ncm: string): string {
  return ncm.replace(/\D/g, "");
}

export function buildBenchmarkIndex(entries: ComexEntry[]): BenchmarkIndex {
  const idx: BenchmarkIndex = new Map();
  for (const e of entries) idx.set(normNcm(e.ncm), e);
  return idx;
}

/** Desconto sobre a média que define o piso defensável (heurística). */
const DESCONTO_PISO = 0.2; // 20% abaixo da média
const AMOSTRA_MINIMA_CONFIAVEL = 5;

/**
 * Monta o benchmark para um NCM. `historico` (opcional) tem prioridade sobre o
 * ComexStat (regra 7: o histórico próprio é a referência preferencial).
 */
export function lookupBenchmark(
  index: BenchmarkIndex,
  ncm: string,
  historico?: { mediaFobKg: number; amostra: number } | null,
): Benchmark {
  if (historico && historico.mediaFobKg > 0) {
    const media = historico.mediaFobKg;
    return {
      fonte: "Histórico próprio" satisfies FonteBenchmark,
      mediaFobKg: media,
      pisoDefensavel: round(media * (1 - DESCONTO_PISO)),
      teto: null,
      amostra: historico.amostra,
      nota: `Referência prioritária: histórico próprio (${historico.amostra} cotação(ões) fechada(s)). Piso defensável = média −${DESCONTO_PISO * 100}% (heurística).`,
    };
  }

  const e = index.get(normNcm(ncm));
  if (e && e.fobKg > 0) {
    const confiavel = e.amostra >= AMOSTRA_MINIMA_CONFIAVEL;
    return {
      fonte: "ComexStat" satisfies FonteBenchmark,
      mediaFobKg: round(e.fobKg),
      pisoDefensavel: round(e.fobKg * (1 - DESCONTO_PISO)),
      teto: null,
      amostra: e.amostra,
      nota:
        `ComexStat (1ºsem/2023, China, marítima): média US$ ${round(e.fobKg)}/kg em ${e.amostra} DI(s). ` +
        `Piso defensável = média −${DESCONTO_PISO * 100}% (heurística — base traz média, não distribuição).` +
        (confiavel ? "" : " ⚠ amostra pequena, confiança reduzida."),
    };
  }

  return {
    fonte: "sem base" satisfies FonteBenchmark,
    mediaFobKg: null,
    pisoDefensavel: null,
    teto: null,
    amostra: 0,
    nota: "Sem base ComexStat/histórico para este NCM — calibragem por classe/heurística (sem validação estatística).",
  };
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
