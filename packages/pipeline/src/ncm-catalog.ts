/**
 * Catálogo NCM vigente — cache local da tabela oficial Siscomex (Classif API pública).
 * @see tools/fetch-ncm-siscomex.cjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface NcmVigenteCache {
  fonte: string;
  dataUltimaAtualizacao: string | null;
  total: number;
  itens: Record<string, string>;
}

export interface NcmCatalog {
  fonte: string;
  dataUltimaAtualizacao: string | null;
  total: number;
  existe(ncm: string): boolean;
  descricao(ncm: string): string | null;
  listarPorCapitulo(capitulo4: string): Array<{ ncm: string; descricao: string }>;
}

export function normNcm8(ncm: string): string | null {
  const d = ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  return d.length === 8 ? d : null;
}

export function ncmVigentePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "data", "ncm-vigente.json");
}

export function loadNcmVigente(path = ncmVigentePath()): NcmVigenteCache {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as NcmVigenteCache;
}

export function criarNcmCatalog(cache: NcmVigenteCache): NcmCatalog {
  const itens = cache.itens ?? {};
  return {
    fonte: cache.fonte,
    dataUltimaAtualizacao: cache.dataUltimaAtualizacao,
    total: cache.total ?? Object.keys(itens).length,
    existe(ncm: string) {
      const key = normNcm8(ncm);
      return key != null && key in itens;
    },
    descricao(ncm: string) {
      const key = normNcm8(ncm);
      if (!key) return null;
      return itens[key] ?? null;
    },
    listarPorCapitulo(capitulo4: string) {
      const cap = capitulo4.replace(/\D/g, "").slice(0, 4);
      return Object.entries(itens)
        .filter(([k]) => k.startsWith(cap))
        .map(([ncm, descricao]) => ({ ncm, descricao }));
    },
  };
}
