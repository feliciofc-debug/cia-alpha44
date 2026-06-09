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
  /** Busca NCMs vigentes por palavras na descrição oficial Siscomex. */
  buscarPorTexto(texto: string, capitulo4?: string, limite?: number): Array<{ ncm: string; descricao: string; score: number }>;
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

function tokensTexto(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
}

function tokenCombina(query: string, desc: string): boolean {
  if (query === desc) return true;
  const min = 4;
  if (query.length >= min && desc.startsWith(query)) return true;
  if (desc.length >= min && query.startsWith(desc)) return true;
  return false;
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
    buscarPorTexto(texto: string, capitulo4?: string, limite = 5) {
      const cap = capitulo4?.replace(/\D/g, "").slice(0, 4);
      const qt = new Set(tokensTexto(texto));
      if (!qt.size) return [];
      const scored: Array<{ ncm: string; descricao: string; score: number }> = [];
      for (const [ncm, descricao] of Object.entries(itens)) {
        if (cap && !ncm.startsWith(cap)) continue;
        const dt = tokensTexto(descricao);
        let inter = 0;
        for (const t of qt) {
          if (dt.some((d) => tokenCombina(t, d))) inter++;
        }
        if (inter === 0) continue;
        scored.push({ ncm, descricao, score: inter / qt.size });
      }
      return scored.sort((a, b) => b.score - a.score).slice(0, limite);
    },
  };
}
