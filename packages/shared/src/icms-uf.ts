/**
 * Alíquotas internas de ICMS por UF (operações internas — formação de preço).
 * Benefício ALAGOAS: 4% na saída quando destino = AL (planilha 66); demais UFs usam alíquota do destino.
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

export const ICMS_BENEF_ALAGOAS = 0.04;

export function normalizarUf(uf: string): UfBrasil | null {
  const s = uf.trim().toUpperCase();
  return (UFS_BRASIL as readonly string[]).includes(s) ? (s as UfBrasil) : null;
}

/** ICMS efetivo na cascata de saída conforme UF destino e benefício fiscal. */
export function icmsSaidaParaDestino(destino: string, benefFiscal = "ALAGOAS"): number {
  const uf = normalizarUf(destino) ?? "SP";
  const benef = benefFiscal.toUpperCase();
  if (benef === "ALAGOAS" && uf === "AL") {
    return ICMS_BENEF_ALAGOAS;
  }
  return ICMS_INTERNO_UF[uf];
}

export interface UfFiscalInfo {
  sigla: UfBrasil;
  nome: string;
  icmsInterno: number;
  icmsEfetivoSaida: number;
}

export function listarUfsFiscais(benefFiscal = "ALAGOAS"): UfFiscalInfo[] {
  return UFS_BRASIL.map((sigla) => ({
    sigla,
    nome: UF_NOMES[sigla],
    icmsInterno: ICMS_INTERNO_UF[sigla],
    icmsEfetivoSaida: icmsSaidaParaDestino(sigla, benefFiscal),
  }));
}
