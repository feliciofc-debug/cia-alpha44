/** Espelho leve de @cia/shared/icms-uf para o bundle web (evita dep de workspace no Vite). */

export const UFS_BRASIL = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT",
  "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

export type UfBrasil = (typeof UFS_BRASIL)[number];

const ICMS_INTERNO_UF: Record<UfBrasil, number> = {
  AC: 0.19, AL: 0.19, AM: 0.18, AP: 0.18, BA: 0.205, CE: 0.2, DF: 0.2, ES: 0.17,
  GO: 0.19, MA: 0.22, MG: 0.18, MS: 0.17, MT: 0.17, PA: 0.19, PB: 0.2, PE: 0.205,
  PI: 0.21, PR: 0.195, RJ: 0.2, RN: 0.2, RO: 0.195, RR: 0.2, RS: 0.175, SC: 0.17,
  SE: 0.19, SP: 0.18, TO: 0.2,
};

export const UF_NOMES: Record<UfBrasil, string> = {
  AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão",
  MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará",
  PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul",
  SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins",
};

export function normalizarUf(uf: string): UfBrasil | null {
  const s = uf.trim().toUpperCase();
  return (UFS_BRASIL as readonly string[]).includes(s) ? (s as UfBrasil) : null;
}

export function icmsSaidaParaDestino(destino: string, benefFiscal = "ALAGOAS"): number {
  const uf = normalizarUf(destino) ?? "SP";
  if (benefFiscal.toUpperCase() === "ALAGOAS" && uf === "AL") return 0.04;
  return ICMS_INTERNO_UF[uf];
}
