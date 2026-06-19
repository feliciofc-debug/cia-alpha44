/**
 * Calibrador FOB/KG — regra principal do CIA:
 * alvo = max(menor_preço_B2B, piso_defensável sobre média DI)
 * Ponderada ComexStat é sinal secundário — nunca piso.
 */

import type { Benchmark, Calibracao } from "@cia/shared";
import {
  AVISO_BENCHMARK_SO_PONDERADA,
  benchmarkSoPonderado,
  referenciaPrimariaBenchmark,
} from "./benchmark-metrics.js";
import { FOB_KG_FONTE_LINHA } from "./resolver-fob-kg.js";

export interface CalibradorInput {
  /** Alias aceito pela API (`fobKgOriginal`). */
  fobKgInformado?: number | null;
  fobKgOriginal?: number | null;
  fobTotalUS?: number | null;
  pesoLiqKg?: number;
  benchmark: Benchmark;
  /** FOB/kg de linha com NCM mais próximo na mesma planilha (antes do ComexStat). */
  fobKgPlanilhaReferencia?: number | null;
  /** Menor preço B2B internacional informado (opcional). */
  menorPrecoB2BKg?: number | null;
  /** Fonte do FOB (linha, comexstat, planilha-mensal, ncm-irmao…). */
  fobKgFonte?: string | null;
}

function fobVeioDaPlanilhaEmbarque(fonte?: string | null): boolean {
  if (!fonte || fonte === "pendente") return false;
  if (fonte === FOB_KG_FONTE_LINHA) return true;
  if (fonte.startsWith("ncm-irmao(")) return true;
  return false;
}

export function calcFobKg(input: CalibradorInput): number {
  const fobKgInformado = input.fobKgInformado ?? input.fobKgOriginal ?? null;
  const { fobTotalUS, pesoLiqKg = 0, fobKgPlanilhaReferencia } = input;
  if (fobKgInformado !== null && fobKgInformado > 0) return fobKgInformado;
  if (fobTotalUS && fobTotalUS > 0 && pesoLiqKg > 0) return fobTotalUS / pesoLiqKg;
  if (fobKgPlanilhaReferencia != null && fobKgPlanilhaReferencia > 0) return fobKgPlanilhaReferencia;
  return 0;
}

export function calibrarFobKg(input: CalibradorInput): Calibracao {
  const fobKgOriginal = calcFobKg(input);
  const { benchmark, menorPrecoB2BKg, fobKgPlanilhaReferencia, fobKgFonte } = input;
  const refPlanilha = fobKgPlanilhaReferencia != null && fobKgPlanilhaReferencia > 0 ? fobKgPlanilhaReferencia : null;
  const refPrim = referenciaPrimariaBenchmark(benchmark);
  const soPonderada = benchmarkSoPonderado(benchmark);
  const avisoPond = benchmark.avisoBenchmark ?? (soPonderada ? AVISO_BENCHMARK_SO_PONDERADA : "");

  /** FOB informado na planilha do fornecedor / mesma carga — não elevar ao piso DI. */
  if (fobVeioDaPlanilhaEmbarque(fobKgFonte) && fobKgOriginal > 0) {
    const desvioBenchmarkPct =
      refPrim && refPrim > 0 ? ((fobKgOriginal - refPrim) / refPrim) * 100 : null;
    return {
      fobKgOriginal,
      fobKgCalibrado: fobKgOriginal,
      desvioBenchmarkPct,
      ajustado: false,
      justificativa: `FOB/KG US$ ${fobKgOriginal.toFixed(4)}/kg da planilha de embarque`,
    };
  }

  /** Planilha operacional INNOVE (IMPORTAÇÕES DA CHINA) — média DI soberana. */
  if (benchmark.fonte === "Histórico próprio" && refPrim != null && refPrim > 0) {
    const desvioBenchmarkPct =
      fobKgOriginal > 0 ? ((fobKgOriginal - refPrim) / refPrim) * 100 : null;
    return {
      fobKgOriginal: fobKgOriginal > 0 ? fobKgOriginal : refPrim,
      fobKgCalibrado: refPrim,
      desvioBenchmarkPct,
      ajustado: false,
      justificativa: `FOB/KG US$ ${refPrim.toFixed(4)}/kg (${benchmark.rastroFonte ?? "planilha operacional"})`,
    };
  }

  if (benchmark.fonte === "sem base" || soPonderada || benchmark.pisoDefensavel === null) {
    const calibrado = fobKgOriginal > 0 ? fobKgOriginal : (refPlanilha ?? menorPrecoB2BKg ?? 0);
    const justificativa =
      (refPlanilha && fobKgOriginal <= 0
        ? `FOB/KG US$ ${calibrado.toFixed(4)}/kg da planilha (NCM mais próximo na carga)`
        : benchmark.nota) + (avisoPond ? ` · ${avisoPond}` : "");
    return {
      fobKgOriginal: fobKgOriginal || refPlanilha || null,
      fobKgCalibrado: calibrado,
      desvioBenchmarkPct: null,
      ajustado: false,
      justificativa,
    };
  }

  const piso = benchmark.pisoDefensavel;
  const b2b = menorPrecoB2BKg && menorPrecoB2BKg > 0 ? menorPrecoB2BKg : fobKgOriginal;
  const alvo = Math.max(b2b > 0 ? b2b : refPlanilha ?? piso, piso);

  let calibrado = fobKgOriginal > 0 ? fobKgOriginal : (refPlanilha ?? alvo);
  let ajustado = false;

  if (calibrado < piso) {
    calibrado = alvo;
    ajustado = true;
  }

  const desvioBenchmarkPct =
    refPrim && refPrim > 0 ? ((calibrado - refPrim) / refPrim) * 100 : null;

  const justificativa = ajustado
    ? `FOB/KG ajustado de ${fobKgOriginal.toFixed(4)} para ${calibrado.toFixed(4)} US$/kg (piso defensável ${benchmark.fonte}: ${piso.toFixed(4)})`
    : fobKgOriginal > 0
      ? `FOB/KG ${calibrado.toFixed(4)} US$/kg dentro da faixa ${benchmark.fonte}`
      : `FOB/KG definido em ${calibrado.toFixed(4)} US$/kg (sem valor na planilha)`;

  return {
    fobKgOriginal: fobKgOriginal || null,
    fobKgCalibrado: calibrado,
    desvioBenchmarkPct,
    ajustado,
    justificativa,
  };
}
