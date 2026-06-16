import type { Item } from "./schemas.js";
import { confirmacaoNcmVigente } from "./ncm-confirmacao.js";

export function ncm8Limpo(ncm: string): string {
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

/** Confiança abaixo disto exige confirmação humana (mesmo se compatibilidade = compativel). */
export const LIMIAR_CONFIANCA_NCM = 0.85;

/** Item impede geração do PDF até revisão humana (Confirmar NCM). */
export function itemBloqueiaPdfNcm(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return true;
  if (confirmacaoNcmVigente(it)) return false;
  if (it.compatibilidadeProduto === "incompativel") return true;
  if (it.compatibilidadeProduto === "revisar") return true;
  if (it.ncmValido === false) return true;
  return false;
}

/** Item elegível para Confirmar NCM em lote (não inclui incompatível — exige override 1-a-1). */
export function itemPodeConfirmarNcm(it: Item): boolean {
  if (it.compatibilidadeProduto === "incompativel") return false;
  if (confirmacaoNcmVigente(it)) return false;
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return false;
  if (itemBloqueiaPdfNcm(it)) return true;
  if (it.ncmFonte === "pendente") return true;
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return true;
  return false;
}

/** Confirmar NCM individual — analista pode forçar mesmo se heurística marcou incompatível. */
export function itemPodeConfirmarNcmIndividual(it: Item): boolean {
  if (confirmacaoNcmVigente(it)) return false;
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return false;
  if (it.compatibilidadeProduto === "incompativel") return true;
  return itemPodeConfirmarNcm(it);
}

export function itensPendentesConfirmacaoNcm(itens: Item[]): Item[] {
  return itens.filter(itemPodeConfirmarNcm);
}

/** Item exige ação humana na barra de resolução (confirmar e/ou editar NCM). */
export function itemPrecisaResolucaoNcm(it: Item): boolean {
  if (it.compatibilidadeProduto === "incompativel") return true;
  if (itemPodeConfirmarNcm(it)) return true;
  if (itemBloqueiaPdfNcm(it) && !confirmacaoNcmVigente(it)) return true;
  return false;
}

export function itensResolucaoNcm(itens: Item[]): Array<{ idx: number; ordem: number; item: Item }> {
  return itens
    .map((item, idx) => ({ idx, ordem: item.ordem ?? idx, item }))
    .filter(({ item }) => itemPrecisaResolucaoNcm(item));
}

export function itensBloqueandoPdf(itens: Item[]): Item[] {
  return itens.filter(itemBloqueiaPdfNcm);
}

export { confirmacaoNcmVigente, validarConfirmacaoNcmItem, validarConfirmacaoNcmItens } from "./ncm-confirmacao.js";
