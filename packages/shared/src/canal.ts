/** Canal aduaneiro provável (análise de risco — regras 9–10 do CIA). */
export const CANAIS = [
  "VERDE_PROVAVEL",
  "AMARELO_TECNICO",
  "VERMELHO_TECNICO",
  "CINZA_VALORACAO",
] as const;

export type Canal = (typeof CANAIS)[number];

export const CANAL_LABEL: Record<Canal, string> = {
  VERDE_PROVAVEL: "Verde (provável)",
  AMARELO_TECNICO: "Amarelo (conferência técnica)",
  VERMELHO_TECNICO: "Vermelho (conferência física/técnica)",
  CINZA_VALORACAO: "Cinza (risco de valoração)",
};

/** Cor base para badges de UI. */
export const CANAL_COR: Record<Canal, string> = {
  VERDE_PROVAVEL: "#16a34a",
  AMARELO_TECNICO: "#ca8a04",
  VERMELHO_TECNICO: "#dc2626",
  CINZA_VALORACAO: "#6b7280",
};

/** Origem do benchmark FOB/KG (regra 8 — honestidade). */
export const FONTES_BENCHMARK = [
  "ComexStat",
  "Histórico próprio",
  "sem base",
] as const;
export type FonteBenchmark = (typeof FONTES_BENCHMARK)[number];
