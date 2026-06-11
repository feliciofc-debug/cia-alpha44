/**
 * Análise de risco / canal aduaneiro (regras 9–10).
 */

import type { Benchmark, Calibracao, Canal, Risco } from "@cia/shared";

export interface RiscoInput {
  ncm?: string;
  descPt?: string;
  calibracao: Calibracao;
  benchmark: Benchmark;
  /** FOB/KG final usado na análise (API). */
  fobKgFinal?: number | null;
  anuencia?: string[];
  antidumping?: boolean;
  pesoLiqKg?: number;
  qtd?: number | null;
}

export function analisarRisco(input: RiscoInput): Risco {
  const flags: string[] = [];
  let score = 0;
  let canal: Canal = "VERDE_PROVAVEL";

  const { benchmark, calibracao, anuencia = [], antidumping = false } = input;
  const desvio = calibracao.desvioBenchmarkPct;

  if (antidumping) {
    score += 40;
    flags.push("Antidumping vigente para o NCM");
    canal = "VERMELHO_TECNICO";
  }

  if (anuencia.length > 0) {
    score += 25;
    flags.push(`Anuência: ${anuencia.join(", ")}`);
    if (canal === "VERDE_PROVAVEL") canal = "AMARELO_TECNICO";
  }

  if (benchmark.fonte !== "sem base" && desvio !== null) {
    if (desvio < -25) {
      score += 45;
      flags.push(
        `FOB/KG ${Math.abs(desvio).toFixed(0)}% abaixo da média DI ${benchmark.fonte} → risco de valoração`,
      );
      canal = "CINZA_VALORACAO";
    } else if (desvio < -10) {
      score += 25;
      flags.push(`FOB/KG ${Math.abs(desvio).toFixed(0)}% abaixo da média DI ${benchmark.fonte}`);
      if (canal === "VERDE_PROVAVEL") canal = "CINZA_VALORACAO";
    } else if (desvio <= 15) {
      score += 0;
      flags.push(`FOB/KG dentro da faixa defensável (${benchmark.fonte})`);
    } else {
      score += 10;
      flags.push(`FOB/KG ${desvio.toFixed(0)}% acima da média DI — verificar coerência`);
      if (canal === "VERDE_PROVAVEL") canal = "AMARELO_TECNICO";
    }
  } else if (benchmark.avisoBenchmark) {
    flags.push(benchmark.avisoBenchmark);
    score += 10;
    if (canal === "VERDE_PROVAVEL") canal = "AMARELO_TECNICO";
  } else {
    flags.push("Sem benchmark — risco estimado por heurística");
    score += 15;
    if (canal === "VERDE_PROVAVEL") canal = "AMARELO_TECNICO";
  }

  if (calibracao.ajustado) {
    score += 5;
    flags.push("FOB/KG calibrado para piso defensável");
  }

  score = Math.min(100, Math.max(0, score));

  const justificativa =
    flags.length > 0 ? flags.join(" · ") : "Sem sinais de risco identificados";

  return { canal, score, justificativa, flags };
}
