/**
 * Análise de risco / canal aduaneiro provável (regras 9–10 do CIA).
 *
 * Score 0–100 (maior = mais risco). Sinais considerados:
 *  - distância do FOB/KG em relação ao benchmark (subfaturamento → valoração);
 *  - anuência por NCM (ANATEL/ANVISA/INMETRO → conferência técnica);
 *  - antidumping vigente (→ vermelho);
 *  - ausência de base de benchmark (incerteza);
 *  - amostra pequena no benchmark.
 *
 * O canal NÃO é só uma função do score: regras específicas (antidumping,
 * subfaturamento abaixo do piso) têm precedência.
 */

import type { Benchmark, Calibracao, Canal, Risco } from "@cia/shared";

export interface RiscoInput {
  benchmark: Benchmark;
  calibracao: Calibracao;
  /** FOB/KG efetivamente usado na cotação (US$/kg). */
  fobKgFinal: number;
  /** Órgãos anuentes para o NCM (ex.: ["ANATEL"]). */
  anuencia?: string[];
  /** Há antidumping vigente para o NCM/origem? */
  antidumping?: boolean;
}

export function analisarRisco(input: RiscoInput): Risco {
  const { benchmark, fobKgFinal } = input;
  const anuencia = input.anuencia ?? [];
  const antidumping = input.antidumping ?? false;
  const media = benchmark.mediaFobKg;
  const piso = benchmark.pisoDefensavel;

  let score = 8; // baseline verde
  const flags: string[] = [];
  const motivos: string[] = [];

  // 1) Distância do benchmark.
  let abaixoDoPiso = false;
  if (media !== null) {
    const desvio = (fobKgFinal - media) / media;
    const desvioPct = Math.round(desvio * 100);
    if (piso !== null && fobKgFinal < piso) {
      abaixoDoPiso = true;
      score += 55;
      flags.push("FOB abaixo do piso defensável");
      motivos.push(`FOB/KG ${Math.abs(desvioPct)}% abaixo da média ComexStat e abaixo do piso defensável → risco de valoração`);
    } else if (desvio < -0.1) {
      score += 22;
      flags.push("FOB abaixo da média");
      motivos.push(`FOB/KG ${Math.abs(desvioPct)}% abaixo da média ComexStat para esta NCM`);
    } else {
      motivos.push(`FOB/KG coerente com o benchmark (${desvioPct >= 0 ? "+" : ""}${desvioPct}% vs média)`);
    }
    if (benchmark.amostra > 0 && benchmark.amostra < 5) {
      score += 8;
      flags.push("amostra pequena");
    }
  } else {
    score += 15;
    flags.push("sem benchmark");
    motivos.push("Sem base de benchmark para o NCM — incerteza de valoração");
  }

  // 2) Anuência.
  if (anuencia.length > 0) {
    score += 18;
    flags.push(...anuencia.map((a) => `anuência ${a}`));
    motivos.push(`Anuência exigida: ${anuencia.join(", ")} → conferência técnica provável`);
  }

  // 3) Antidumping.
  if (antidumping) {
    score += 50;
    flags.push("antidumping vigente");
    motivos.push("Antidumping vigente para o NCM/origem");
  }

  score = Math.min(100, Math.max(0, score));

  // Canal: regras específicas têm precedência sobre o score.
  let canal: Canal;
  if (antidumping) {
    canal = "VERMELHO_TECNICO";
  } else if (abaixoDoPiso) {
    canal = "CINZA_VALORACAO";
  } else if (anuencia.length > 0) {
    canal = score >= 50 ? "VERMELHO_TECNICO" : "AMARELO_TECNICO";
  } else if (score >= 50) {
    canal = "VERMELHO_TECNICO";
  } else if (score >= 25) {
    canal = "AMARELO_TECNICO";
  } else {
    canal = "VERDE_PROVAVEL";
  }

  return {
    canal,
    score,
    justificativa: motivos.join(". ") + ".",
    flags,
  };
}
