/**
 * Guardas de escala FOB — detecta corrupção grosseira (milhões), não julga valoração DI.
 */

import type { Benchmark, Item } from "@cia/shared";
import { fobKgParaPreenchimento } from "./benchmark-metrics.js";
import { resolvePesoLiqRateio, type PesoLinha } from "./linha.js";
import { normalizarNcm } from "./benchmark.js";

/** Peso máximo plausível por linha de embarque (kg). Acima → linha lixo / escala. */
export const PESO_MAX_LINHA_KG = 50_000;

/** Ratio fobTotal / (fobKg×peso) acima disto → corrupção grosseira (não bloqueio silencioso). */
export const RATIO_CORRUPCAO_GROSS = 1_000;

/** Invoice embarque vs planilha×bruto acima disto → lixo de parser (ex.: 58k vs 2,3k). */
export const RATIO_EMBARQUE_PLANILHA_MAX = 10;

export function embarqueSuspeitoVsPlanilha(
  fobEmbarqueUS: number,
  fobEsperadoPlanilha: number | null | undefined,
): boolean {
  if (fobEmbarqueUS <= 0 || fobEsperadoPlanilha == null || fobEsperadoPlanilha <= 0) return false;
  const ratio = fobEmbarqueUS / fobEsperadoPlanilha;
  return ratio > RATIO_EMBARQUE_PLANILHA_MAX || ratio < 1 / RATIO_EMBARQUE_PLANILHA_MAX;
}

export type FlagAnomaliaFob = "peso_absurdo" | "ratio_corrupcao" | "ncm_suspeito";

export interface AnaliseEscalaFob {
  flags: FlagAnomaliaFob[];
  pesoRateio: number;
  fobEsperadoPlanilha: number | null;
  ratio: number | null;
  pesoImplicito: number | null;
}

export function pesoRateioLinha(l: PesoLinha): number {
  return resolvePesoLiqRateio(l);
}

/** NCM malformado típico de parsing (ex.: 00015423). */
export function ncmSuspeitoLixo(ncm: string): boolean {
  const n = normalizarNcm(ncm ?? "");
  if (!n || n === "00000000") return false;
  return /^000\d{5}$/.test(n);
}

export function linhaPesoAbsurdo(l: PesoLinha): boolean {
  return pesoRateioLinha(l) > PESO_MAX_LINHA_KG;
}

export function fobKgBenchmark(benchmark?: Benchmark | null): number | null {
  if (!benchmark) return null;
  const v = fobKgParaPreenchimento(benchmark);
  return v != null && v > 0 ? v : null;
}

/** FOB total US$ = PREÇO FOB/KG (planilha/ComexStat) × peso da linha. */
export function fobTotalPlanilhaPeso(
  pesoRateio: number,
  benchmark?: Benchmark | null,
  fobKgManual?: number | null,
): number {
  if (pesoRateio <= 0) return 0;
  if (fobKgManual != null && fobKgManual > 0) return fobKgManual * pesoRateio;
  const fobKg = fobKgBenchmark(benchmark);
  if (fobKg != null) return fobKg * pesoRateio;
  return 0;
}

export function analisarEscalaFob(params: {
  ncm: string;
  pesoLiqKg: number;
  pesoBrutoKg?: number | null;
  fobTotalUS: number;
  fobKgPlanilha?: number | null;
}): AnaliseEscalaFob {
  const pesoRateio = resolvePesoLiqRateio({
    pesoLiqKg: params.pesoLiqKg,
    pesoBrutoKg: params.pesoBrutoKg ?? null,
  });
  const flags: FlagAnomaliaFob[] = [];
  if (pesoRateio > PESO_MAX_LINHA_KG) flags.push("peso_absurdo");
  if (ncmSuspeitoLixo(params.ncm)) flags.push("ncm_suspeito");

  const fobKg = params.fobKgPlanilha ?? null;
  const fobEsperadoPlanilha =
    fobKg != null && pesoRateio > 0 ? fobKg * pesoRateio : null;

  let ratio: number | null = null;
  let pesoImplicito: number | null = null;

  if (fobEsperadoPlanilha != null && fobEsperadoPlanilha > 0 && params.fobTotalUS > 0) {
    ratio = params.fobTotalUS / fobEsperadoPlanilha;
    if (ratio > RATIO_CORRUPCAO_GROSS || ratio < 1 / RATIO_CORRUPCAO_GROSS) {
      flags.push("ratio_corrupcao");
    }
  }
  if (fobKg != null && fobKg > 0 && params.fobTotalUS > 0) {
    pesoImplicito = params.fobTotalUS / fobKg;
  }

  return { flags, pesoRateio, fobEsperadoPlanilha, ratio, pesoImplicito };
}

export function analisarEscalaFobItem(it: Item, benchmark?: Benchmark | null): AnaliseEscalaFob {
  const bench = benchmark ?? it.benchmark;
  return analisarEscalaFob({
    ncm: it.ncm,
    pesoLiqKg: it.pesoLiqKg,
    pesoBrutoKg: it.pesoBrutoKg,
    fobTotalUS: it.fobTotalUS,
    fobKgPlanilha: fobKgBenchmark(bench),
  });
}

/** true se persistência de fobTotalUS deve ser bloqueada (corrupção grosseira). */
export function bloquearPersistenciaFobCorrupto(analise: AnaliseEscalaFob): boolean {
  return analise.flags.includes("ratio_corrupcao") || analise.flags.includes("peso_absurdo");
}
