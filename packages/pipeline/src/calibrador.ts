/**
 * Calibrador FOB/KG — regra principal do CIA:
 * alvo = max(menor_preço_B2B, piso_defensável_ComexStat)
 * Nunca usar preço nacional como base.
 */

import type { Benchmark, Calibracao } from "@cia/shared";

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
  const { benchmark, menorPrecoB2BKg, fobKgPlanilhaReferencia } = input;
  const refPlanilha = fobKgPlanilhaReferencia != null && fobKgPlanilhaReferencia > 0 ? fobKgPlanilhaReferencia : null;

  if (benchmark.fonte === "sem base" || benchmark.pisoDefensavel === null) {
    const calibrado = fobKgOriginal > 0 ? fobKgOriginal : (refPlanilha ?? menorPrecoB2BKg ?? 0);
    const justificativa =
      refPlanilha && fobKgOriginal <= 0
        ? `FOB/KG US$ ${calibrado.toFixed(4)}/kg da planilha (NCM mais próximo na carga)`
        : benchmark.nota;
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

  const media = benchmark.mediaFobKg;
  const desvioBenchmarkPct =
    media && media > 0 ? ((calibrado - media) / media) * 100 : null;

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
