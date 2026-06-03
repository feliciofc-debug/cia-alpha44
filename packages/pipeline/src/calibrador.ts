/**
 * Calibrador FOB/KG — regra principal do CIA:
 * alvo = max(menor_preço_B2B, piso_defensável_ComexStat)
 * Nunca usar preço nacional como base.
 */

import type { Benchmark, Calibracao } from "@cia/shared";

export interface CalibradorInput {
  fobKgInformado: number | null;
  fobTotalUS?: number | null;
  pesoLiqKg: number;
  benchmark: Benchmark;
  /** Menor preço B2B internacional informado (opcional). */
  menorPrecoB2BKg?: number | null;
}

export function calcFobKg(input: CalibradorInput): number {
  const { fobKgInformado, fobTotalUS, pesoLiqKg } = input;
  if (fobKgInformado !== null && fobKgInformado > 0) return fobKgInformado;
  if (fobTotalUS && fobTotalUS > 0 && pesoLiqKg > 0) return fobTotalUS / pesoLiqKg;
  return 0;
}

export function calibrarFobKg(input: CalibradorInput): Calibracao {
  const fobKgOriginal = calcFobKg(input);
  const { benchmark, menorPrecoB2BKg } = input;

  if (benchmark.fonte === "sem base" || benchmark.pisoDefensavel === null) {
    const calibrado = fobKgOriginal > 0 ? fobKgOriginal : (menorPrecoB2BKg ?? 0);
    return {
      fobKgOriginal: fobKgOriginal || null,
      fobKgCalibrado: calibrado,
      desvioBenchmarkPct: null,
      ajustado: false,
      justificativa: benchmark.nota,
    };
  }

  const piso = benchmark.pisoDefensavel;
  const b2b = menorPrecoB2BKg && menorPrecoB2BKg > 0 ? menorPrecoB2BKg : fobKgOriginal;
  const alvo = Math.max(b2b > 0 ? b2b : piso, piso);

  let calibrado = fobKgOriginal > 0 ? fobKgOriginal : alvo;
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
