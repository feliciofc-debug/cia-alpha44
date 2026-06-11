import type { Item } from "./schemas.js";
import { confirmacaoNcmVigente } from "./ncm-confirmacao.js";

export function ncm8Limpo(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/** Item impede geração do PDF até revisão humana (Confirmar NCM). */
export function itemBloqueiaPdfNcm(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return true;
  if (it.compatibilidadeProduto === "incompativel") return true;
  if (confirmacaoNcmVigente(it)) return false;
  if (it.compatibilidadeProduto === "revisar") return true;
  if (it.ncmValido === false) return true;
  return false;
}

export function itensBloqueandoPdf(itens: Item[]): Item[] {
  return itens.filter(itemBloqueiaPdfNcm);
}

export { confirmacaoNcmVigente, validarConfirmacaoNcmItem, validarConfirmacaoNcmItens } from "./ncm-confirmacao.js";
