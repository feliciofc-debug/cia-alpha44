import type { Item } from "./schemas.js";
import { ncm8Limpo } from "./pdf-ncm.js";

/** Confirmação humana ainda válida para o NCM atual do item. */
export function confirmacaoNcmVigente(it: Item): boolean {
  if (!it.ncmRevisadoHumano || !it.ncmConfirmado) return false;
  const atual = ncm8Limpo(it.ncm ?? "");
  if (!atual || atual === "00000000") return false;
  return atual === ncm8Limpo(it.ncmConfirmado);
}

export function metaConfirmacaoNcm(ncm: string, confirmadoPor?: string | null): Pick<
  Item,
  "ncmRevisadoHumano" | "ncmRevisadoEm" | "ncmConfirmado" | "ncmConfirmadoPor"
> {
  return {
    ncmRevisadoHumano: true,
    ncmRevisadoEm: new Date().toISOString(),
    ncmConfirmado: ncm8Limpo(ncm),
    ...(confirmadoPor?.trim() ? { ncmConfirmadoPor: confirmadoPor.trim() } : {}),
  };
}

export function limparConfirmacaoNcm(it: Item): Item {
  return {
    ...it,
    ncmRevisadoHumano: false,
    ncmRevisadoEm: undefined,
    ncmConfirmado: undefined,
    ncmConfirmadoPor: undefined,
  };
}

/** Invalida confirmação se o NCM mudou ou o rastro está incompleto. */
export function validarConfirmacaoNcmItem(it: Item): Item {
  if (!it.ncmRevisadoHumano) return it;
  return confirmacaoNcmVigente(it) ? it : limparConfirmacaoNcm(it);
}

export function validarConfirmacaoNcmItens(itens: Item[]): Item[] {
  return itens.map(validarConfirmacaoNcmItem);
}
