/**
 * Regimes fiscais por UF de destino — presets de parâmetros sobre o motor atual.
 * Nenhuma fórmula nova: apenas alíquotas que alimentam ParamsSaida + aliqFundos.
 */

import { UF_NOMES, type UfBrasil } from "./icms-uf.js";

export const REGIME_DESTINO_INTEGRAL = "INTEGRAL" as const;

export type RegimeDestinoId =
  | typeof REGIME_DESTINO_INTEGRAL
  | "SC_TTD_FASE1"
  | "SC_TTD_FASE2"
  | "MG_CORREDOR"
  | "MG_TTS_ECOMMERCE"
  | "ES_INVEST";

/** Parâmetros editáveis do regime (persistidos na cotação). */
export interface RegimeDestinoParams {
  icmsImportacaoAliq: number;
  icmsSaidaEfetivaAliq: number;
  aliqFundos: number;
  /** MG TTS E-commerce — somado à saída efetiva (parâmetro editável). */
  difalAliq?: number;
}

export interface RegimeDestinoPreset extends RegimeDestinoParams {
  id: RegimeDestinoId;
  nome: string;
  /** Rótulo na lista de destino (seletor UF). */
  labelLista: string;
  uf: UfBrasil;
  fonteLegal: string;
  observacao?: string;
  icmsSaidaMin?: number;
  icmsSaidaMax?: number;
}

export const REGIMES_DESTINO_PRESETS: Record<Exclude<RegimeDestinoId, typeof REGIME_DESTINO_INTEGRAL>, RegimeDestinoPreset> = {
  SC_TTD_FASE1: {
    id: "SC_TTD_FASE1",
    nome: "SC TTD fase 1",
    labelLista: "Santa Catarina — TTD 2,6% (fase 1)",
    uf: "SC",
    icmsImportacaoAliq: 0.026,
    icmsSaidaEfetivaAliq: 0.026,
    aliqFundos: 0.004,
    fonteLegal: "Lei SC 17.763/2019 — TTD 409",
    observacao: "Antecipação 2,6% na entrada; saída efetiva 2,6% + fundos 0,4% (total 3%).",
  },
  SC_TTD_FASE2: {
    id: "SC_TTD_FASE2",
    nome: "SC TTD fase 2",
    labelLista: "Santa Catarina — TTD 1% (fase 2)",
    uf: "SC",
    icmsImportacaoAliq: 0.01,
    icmsSaidaEfetivaAliq: 0.01,
    aliqFundos: 0.004,
    fonteLegal: "Lei SC 17.763/2019 — TTD 409 (após 36º mês)",
    observacao: "Antecipação 1%; saída efetiva 1% + fundos 0,4%.",
  },
  MG_CORREDOR: {
    id: "MG_CORREDOR",
    nome: "MG Corredor de Importação",
    labelLista: "Minas Gerais — Corredor",
    uf: "MG",
    icmsImportacaoAliq: 0,
    icmsSaidaEfetivaAliq: 0.03,
    aliqFundos: 0,
    icmsSaidaMin: 0.015,
    icmsSaidaMax: 0.03,
    fonteLegal: "Resolução MG — Corredor de Importação",
    observacao: "ICMS importação diferido; saída interestadual efetiva editável (1,5%–3%).",
  },
  MG_TTS_ECOMMERCE: {
    id: "MG_TTS_ECOMMERCE",
    nome: "MG TTS E-commerce",
    labelLista: "Minas Gerais — TTS E-commerce",
    uf: "MG",
    icmsImportacaoAliq: 0,
    icmsSaidaEfetivaAliq: 0.013,
    aliqFundos: 0,
    difalAliq: 0,
    fonteLegal: "Resolução MG — TTS E-commerce",
    observacao: "Importação diferida; saída 1,3% + DIFAL editável.",
  },
  ES_INVEST: {
    id: "ES_INVEST",
    nome: "ES Invest/Compete",
    labelLista: "Espírito Santo — Invest/Compete",
    uf: "ES",
    icmsImportacaoAliq: 0,
    icmsSaidaEfetivaAliq: 0.011,
    aliqFundos: 0,
    fonteLegal: "Lei ES — regime Invest/Compete",
    observacao: "Importação diferida; saída interestadual efetiva 1,1% (editável).",
  },
};

export function isRegimeDestinoId(v: string | null | undefined): v is RegimeDestinoId {
  if (!v || v === REGIME_DESTINO_INTEGRAL) return v === REGIME_DESTINO_INTEGRAL;
  return v in REGIMES_DESTINO_PRESETS;
}

export function presetRegimeDestino(id: RegimeDestinoId | null | undefined): RegimeDestinoPreset | null {
  if (!id || id === REGIME_DESTINO_INTEGRAL) return null;
  return REGIMES_DESTINO_PRESETS[id] ?? null;
}

/** Parâmetros efetivos: defaults do preset + overrides persistidos. */
export function resolverParamsRegimeDestino(
  regimeId: RegimeDestinoId | null | undefined,
  overrides?: Partial<RegimeDestinoParams> | null,
): RegimeDestinoParams | null {
  const preset = presetRegimeDestino(regimeId);
  if (!preset) return null;
  return {
    icmsImportacaoAliq: overrides?.icmsImportacaoAliq ?? preset.icmsImportacaoAliq,
    icmsSaidaEfetivaAliq: overrides?.icmsSaidaEfetivaAliq ?? preset.icmsSaidaEfetivaAliq,
    aliqFundos: overrides?.aliqFundos ?? preset.aliqFundos,
    difalAliq: overrides?.difalAliq ?? preset.difalAliq,
  };
}

/** Valor do seletor de destino: sigla UF (integral) ou id do regime. */
export type DestinoSelecao = UfBrasil | Exclude<RegimeDestinoId, typeof REGIME_DESTINO_INTEGRAL>;

export interface OpcaoDestino {
  value: DestinoSelecao;
  label: string;
  uf: UfBrasil;
  regimeDestinoId: RegimeDestinoId | null;
}

/** Lista para o seletor: estados (integral) + regimes especiais. */
export function listarOpcoesDestino(): OpcaoDestino[] {
  const ufs: OpcaoDestino[] = (Object.keys(UF_NOMES) as UfBrasil[]).map((sigla) => ({
    value: sigla,
    label: `${sigla} — ${UF_NOMES[sigla]}`,
    uf: sigla,
    regimeDestinoId: null,
  }));
  const regimes: OpcaoDestino[] = Object.values(REGIMES_DESTINO_PRESETS).map((p) => ({
    value: p.id as Exclude<RegimeDestinoId, typeof REGIME_DESTINO_INTEGRAL>,
    label: p.labelLista,
    uf: p.uf,
    regimeDestinoId: p.id,
  }));
  return [...ufs, ...regimes];
}

export function parseDestinoSelecao(value: string): {
  destino: UfBrasil;
  regimeDestinoId: RegimeDestinoId | null;
} {
  const preset = REGIMES_DESTINO_PRESETS[value as keyof typeof REGIMES_DESTINO_PRESETS];
  if (preset) {
    return { destino: preset.uf, regimeDestinoId: preset.id };
  }
  const uf = (Object.keys(UF_NOMES) as UfBrasil[]).find((s) => s === value.toUpperCase());
  return { destino: uf ?? "SP", regimeDestinoId: null };
}

export function destinoSelecaoFromCotacao(destino: string, regimeDestinoId?: string | null): DestinoSelecao {
  if (regimeDestinoId && regimeDestinoId !== REGIME_DESTINO_INTEGRAL && regimeDestinoId in REGIMES_DESTINO_PRESETS) {
    return regimeDestinoId as Exclude<RegimeDestinoId, typeof REGIME_DESTINO_INTEGRAL>;
  }
  return (destino.toUpperCase() as UfBrasil) || "SP";
}

/** IDs de todos os presets para comparador (inclui integral implícito por UF). */
export const REGIMES_COMPARADOR: RegimeDestinoId[] = [
  REGIME_DESTINO_INTEGRAL,
  "SC_TTD_FASE1",
  "SC_TTD_FASE2",
  "MG_CORREDOR",
  "MG_TTS_ECOMMERCE",
  "ES_INVEST",
];
