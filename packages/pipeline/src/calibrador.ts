/**
 * Calibrador de FOB/KG (regras 6–7 do CIA).
 *
 * Regra principal: calibrar para o MENOR FOB/KG internacional B2B defensável,
 * sem cair tão baixo que dispare valoração/canal vermelho:
 *
 *     alvo = max(menor_preço_B2B, piso_defensável_ComexStat)
 *
 * NUNCA usa preço nacional como base. Quando não há benchmark, mantém o FOB
 * original e marca a calibragem como heurística (sem validação).
 */

import type { Benchmark, Calibracao } from "@cia/shared";

export interface CalibrarInput {
  /** FOB/KG original do fornecedor (US$/kg), se houver. */
  fobKgOriginal: number | null;
  /** Menor preço B2B internacional conhecido (US$/kg), se houver. */
  menorB2BKg?: number | null;
  benchmark: Benchmark;
}

export function calibrarFobKg(input: CalibrarInput): Calibracao {
  const { fobKgOriginal, benchmark } = input;
  const menorB2B = input.menorB2BKg ?? null;
  const piso = benchmark.pisoDefensavel;
  const media = benchmark.mediaFobKg;

  // Sem base estatística: não há como calibrar com defensabilidade.
  if (piso === null || media === null) {
    const valor = fobKgOriginal ?? menorB2B ?? 0;
    return {
      fobKgOriginal,
      fobKgCalibrado: round(valor),
      desvioBenchmarkPct: null,
      ajustado: false,
      justificativa:
        "Sem benchmark para o NCM — FOB/KG mantido (calibragem por classe/heurística, sem validação estatística).",
    };
  }

  // Alvo defensável = maior entre o menor B2B conhecido e o piso defensável.
  const alvoDefensavel = menorB2B !== null ? Math.max(menorB2B, piso) : piso;

  let calibrado: number;
  let ajustado: boolean;
  let justificativa: string;

  if (fobKgOriginal === null) {
    calibrado = alvoDefensavel;
    ajustado = true;
    justificativa = `Sem FOB de origem: adotado o menor valor defensável US$ ${round(alvoDefensavel)}/kg (piso ComexStat${menorB2B !== null ? " / B2B" : ""}).`;
  } else if (fobKgOriginal < piso) {
    // Abaixo do piso → risco de subfaturamento; sobe para o alvo defensável.
    calibrado = alvoDefensavel;
    ajustado = true;
    justificativa = `FOB original US$ ${round(fobKgOriginal)}/kg abaixo do piso defensável US$ ${round(piso)}/kg (risco de valoração) → calibrado para US$ ${round(alvoDefensavel)}/kg.`;
  } else {
    // Já é defensável (>= piso): mantém — não inflamos um preço legítimo.
    calibrado = fobKgOriginal;
    ajustado = false;
    justificativa = `FOB original US$ ${round(fobKgOriginal)}/kg já é defensável (>= piso US$ ${round(piso)}/kg). Mantido.`;
  }

  const desvio = media > 0 ? (calibrado - media) / media : null;
  return {
    fobKgOriginal,
    fobKgCalibrado: round(calibrado),
    desvioBenchmarkPct: desvio === null ? null : round(desvio * 100),
    ajustado,
    justificativa,
  };
}

function round(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}
