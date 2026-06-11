/**
 * ICMS por UF — saída (interna × interestadual) e entrada (regime de desembaraço).
 *
 * Saída: Res. Senado Federal 13/2012 — mercadoria importada, operação interestadual = 4%
 * (nacional; independe do regime). Interna: ICMS_INTERNO_UF[ufEmpresa] quando destino = ufEmpresa.
 *
 * Entrada: regime AL_DIFERIDO → 0 (diferido); NORMAL → 0 v1 + aviso obrigatório.
 */

export const UFS_BRASIL = [
  "AC",
  "AL",
  "AM",
  "AP",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MG",
  "MS",
  "MT",
  "PA",
  "PB",
  "PE",
  "PI",
  "PR",
  "RJ",
  "RN",
  "RO",
  "RR",
  "RS",
  "SC",
  "SE",
  "SP",
  "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];

export type RegimeIcms = "AL_DIFERIDO" | "NORMAL";

/** Alíquota interestadual importação — Res. Senado Federal 13/2012. */
export const ICMS_SAIDA_INTERESTADUAL_IMPORT = 0.04;

export const FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL = "Res. Senado Federal 13/2012";

export const AVISO_REGIME_ICMS_NORMAL =
  "ICMS de importação não calculado neste regime (v1)";

/** Alíquota interna padrão (decimal). Fonte: tabela ICMS interestadual — revisar conforme NCM/regime. */
export const ICMS_INTERNO_UF: Record<UfBrasil, number> = {
  AC: 0.19,
  AL: 0.19,
  AM: 0.18,
  AP: 0.18,
  BA: 0.205,
  CE: 0.2,
  DF: 0.2,
  ES: 0.17,
  GO: 0.19,
  MA: 0.22,
  MG: 0.18,
  MS: 0.17,
  MT: 0.17,
  PA: 0.19,
  PB: 0.2,
  PE: 0.205,
  PI: 0.21,
  PR: 0.195,
  RJ: 0.2,
  RN: 0.2,
  RO: 0.195,
  RR: 0.2,
  RS: 0.175,
  SC: 0.17,
  SE: 0.19,
  SP: 0.18,
  TO: 0.2,
};

export const UF_NOMES: Record<UfBrasil, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AM: "Amazonas",
  AP: "Amapá",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MG: "Minas Gerais",
  MS: "Mato Grosso do Sul",
  MT: "Mato Grosso",
  PA: "Pará",
  PB: "Paraíba",
  PE: "Pernambuco",
  PI: "Piauí",
  PR: "Paraná",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RO: "Rondônia",
  RR: "Roraima",
  RS: "Rio Grande do Sul",
  SC: "Santa Catarina",
  SE: "Sergipe",
  SP: "São Paulo",
  TO: "Tocantins",
};

/** @deprecated Preferir resolverIcmsEfetivo — benefício AL 4% só em operação interna AL (legado). */
export const ICMS_BENEF_ALAGOAS = 0.04;

export function normalizarUf(uf: string): UfBrasil | null {
  const s = uf.trim().toUpperCase();
  return (UFS_BRASIL as readonly string[]).includes(s) ? (s as UfBrasil) : null;
}

export interface ResolverIcmsInput {
  /** UF do estabelecimento vendedor (default AL). */
  ufEmpresa: string;
  destino: string;
  regimeIcms: RegimeIcms;
  icmsSaidaManual?: number | null;
  icmsSaidaManualFlag?: boolean;
}

export interface IcmsEfetivoResult {
  icmsEntradaEfetivo: number;
  icmsSaidaEfetivo: number;
  fundamentoSaida: string;
  operacaoInterestadual: boolean;
  avisoRegimeIcms?: string;
}

/** Resolve ICMS entrada (regime) e saída (interna × interestadual × manual). */
export function resolverIcmsEfetivo(input: ResolverIcmsInput): IcmsEfetivoResult {
  const ufEmpresa = normalizarUf(input.ufEmpresa) ?? "AL";
  const destino = normalizarUf(input.destino) ?? "SP";
  const interestadual = destino !== ufEmpresa;

  let icmsSaidaEfetivo: number;
  let fundamentoSaida: string;

  if (input.icmsSaidaManualFlag && input.icmsSaidaManual != null) {
    icmsSaidaEfetivo = input.icmsSaidaManual;
    fundamentoSaida = "manual (editado na cotação)";
  } else if (interestadual) {
    icmsSaidaEfetivo = ICMS_SAIDA_INTERESTADUAL_IMPORT;
    fundamentoSaida = FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL;
  } else {
    icmsSaidaEfetivo = ICMS_INTERNO_UF[ufEmpresa];
    fundamentoSaida = `ICMS interno UF ${ufEmpresa}`;
  }

  const icmsEntradaEfetivo = 0;
  const avisoRegimeIcms =
    input.regimeIcms === "NORMAL" ? AVISO_REGIME_ICMS_NORMAL : undefined;

  return {
    icmsEntradaEfetivo,
    icmsSaidaEfetivo,
    fundamentoSaida,
    operacaoInterestadual: interestadual,
    avisoRegimeIcms,
  };
}

/**
 * @deprecated Use resolverIcmsEfetivo. Mantido para compat — assume ufEmpresa=AL, AL_DIFERIDO.
 * benefFiscal ignorado na saída (regra nacional Res. Senado 13/2012).
 */
export function icmsSaidaParaDestino(
  destino: string,
  _benefFiscal = "ALAGOAS",
  ufEmpresa = "AL",
): number {
  return resolverIcmsEfetivo({
    ufEmpresa,
    destino,
    regimeIcms: "AL_DIFERIDO",
  }).icmsSaidaEfetivo;
}

export interface UfFiscalInfo {
  sigla: UfBrasil;
  nome: string;
  icmsInterno: number;
  icmsEfetivoSaida: number;
}

export function listarUfsFiscais(ufEmpresa = "AL"): UfFiscalInfo[] {
  return UFS_BRASIL.map((sigla) => ({
    sigla,
    nome: UF_NOMES[sigla],
    icmsInterno: ICMS_INTERNO_UF[sigla],
    icmsEfetivoSaida: resolverIcmsEfetivo({
      ufEmpresa,
      destino: sigla,
      regimeIcms: "AL_DIFERIDO",
    }).icmsSaidaEfetivo,
  }));
}
