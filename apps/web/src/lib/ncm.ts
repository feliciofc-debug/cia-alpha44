import type { Item } from "./types.ts";

/** Itens com NCM inválido, pendente ou marcado pela API como incoerente. */
export function itensComNcmInvalido(itens: Item[]): Item[] {
  return itens.filter((it) => {
    const ncm = (it.ncm ?? "").replace(/\D/g, "");
    return it.ncmValido === false || !ncm || ncm === "00000000";
  });
}

export function pdfBloqueadoPorNcm(itens: Item[]): boolean {
  return itensComNcmInvalido(itens).length > 0;
}

export function resumoBloqueioNcm(itens: Item[]): string {
  const inv = itensComNcmInvalido(itens);
  if (!inv.length) return "";
  const nomes = inv
    .slice(0, 3)
    .map((it) => (it.descPt || it.descOriginal || "Item").slice(0, 40))
    .join("; ");
  const extra = inv.length > 3 ? ` (+${inv.length - 3})` : "";
  return `PDF bloqueado: ${inv.length} item(ns) com NCM inválido ou pendente (${nomes}${extra}). Corrija na aba Análise técnica.`;
}
