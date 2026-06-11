import type { FamiliaProduto } from "./tipos.js";
import { normNcm8 } from "../ncm-catalog.js";

/** NCM-8 coerente com um prefixo (2 ou 4 dígitos). */
export function ncmCoerenteComPrefixo(ncm: string, prefixo: string): boolean {
  const key = normNcm8(ncm);
  if (!key) return false;
  const pre = prefixo.replace(/\D/g, "");
  return pre.length >= 2 && key.startsWith(pre);
}

/** NCM-8 coerente com qualquer prefixo da família. */
export function ncmCoerenteComFamilia(ncm: string, familia: FamiliaProduto | null): boolean {
  if (!familia) return true;
  return familia.prefixos.some((p) => ncmCoerenteComPrefixo(ncm, p));
}

/** União de prefixos de várias famílias (deduplicado). */
export function prefixosDasFamilias(familias: FamiliaProduto[]): string[] {
  const set = new Set<string>();
  for (const f of familias) {
    for (const p of f.prefixos) set.add(p.replace(/\D/g, "").slice(0, 4));
  }
  return [...set];
}

/** Primeiro prefixo de 4 dígitos útil para busca textual restrita. */
export function prefixoBuscaPrincipal(familia: FamiliaProduto | null): string | undefined {
  if (!familia) return undefined;
  const p4 = familia.prefixos.find((p) => p.replace(/\D/g, "").length === 4);
  if (p4) return p4.replace(/\D/g, "").slice(0, 4);
  const p2 = familia.prefixos.find((p) => p.replace(/\D/g, "").length === 2);
  return p2?.replace(/\D/g, "").slice(0, 2);
}
