import type { Item } from "./types.ts";
import {
  confirmacaoNcmVigente,
  itemBloqueiaPdfNcm,
  itensBloqueandoPdf,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
} from "@cia/shared";

/** @deprecated use itemBloqueiaPdfNcm / itensBloqueandoPdf */
export function itensComNcmInvalido(itens: Item[]): Item[] {
  return itensBloqueandoPdf(itens);
}

export function itensComIncompatibilidadeProduto(itens: Item[]): Item[] {
  return itens.filter((it) => it.compatibilidadeProduto === "incompativel");
}

export function itensEmRevisaoNcm(itens: Item[]): Item[] {
  return itens.filter(
    (it) =>
      !confirmacaoNcmVigente(it) &&
      (it.compatibilidadeProduto === "revisar" || it.ncmValido === false) &&
      it.compatibilidadeProduto !== "incompativel",
  );
}

export function itemPodeConfirmarNcm(it: Item): boolean {
  const ncm = (it.ncm ?? "").replace(/\D/g, "");
  if (!ncm || ncm === "00000000") return false;
  if (it.compatibilidadeProduto === "incompativel") return false;
  if (confirmacaoNcmVigente(it)) return false;
  return it.compatibilidadeProduto === "revisar" || it.ncmValido === false;
}

export function itemPodeDesfazerNcm(it: Item): boolean {
  return confirmacaoNcmVigente(it);
}

export { metaConfirmacaoNcm, validarConfirmacaoNcmItem, confirmacaoNcmVigente, limparConfirmacaoNcm } from "@cia/shared";

export function pdfBloqueadoPorNcm(itens: Item[]): boolean {
  return itens.some(itemBloqueiaPdfNcm);
}

export function resumoBloqueioNcm(itens: Item[]): string {
  const bloqueados = itensBloqueandoPdf(itens);
  if (!bloqueados.length) return "";
  const nomes = bloqueados
    .slice(0, 3)
    .map((it) => (it.descPt || it.descOriginal || "Item").slice(0, 40))
    .join("; ");
  const extra = bloqueados.length > 3 ? ` (+${bloqueados.length - 3})` : "";
  const temRevisar = bloqueados.some((it) => it.compatibilidadeProduto === "revisar" || it.ncmValido === false);
  const acao = temRevisar
    ? " Use «Confirmar NCM» na aba Análise técnica."
    : " Corrija na aba Análise técnica.";
  return `PDF bloqueado: ${bloqueados.length} item(ns) pendente(s) de revisão NCM (${nomes}${extra}).${acao}`;
}

/** Aviso não bloqueante — possível incompatibilidade semântica produto × NCM. */
export function avisoCompatibilidadePdf(itens: Item[]): string | null {
  const qtd = itensComIncompatibilidadeProduto(itens).length;
  if (!qtd) return null;
  return `${qtd} item(ns) com possível incompatibilidade NCM × produto — revisar antes de enviar`;
}
