/** Confiança abaixo disto exibe revisão opcional na barra (não bloqueia PDF). */
export const LIMIAR_CONFIANCA_NCM = 0.85;

export function ncm8Limpo(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}
