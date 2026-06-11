/**
 * Catálogo NCM vigente — cache local da tabela oficial Siscomex (Classif API pública).
 * @see tools/fetch-ncm-siscomex.cjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export interface NcmVigenteEntry {
  folha: string;
  completa: string;
}

export interface NcmVigenteCache {
  fonte: string;
  dataUltimaAtualizacao: string | null;
  total: number;
  itens: Record<string, string | NcmVigenteEntry>;
}

export interface NcmCatalog {
  fonte: string;
  dataUltimaAtualizacao: string | null;
  total: number;
  existe(ncm: string): boolean;
  descricao(ncm: string): string | null;
  descricaoCompleta(ncm: string): string | null;
  listarPorCapitulo(capitulo4: string): Array<{ ncm: string; descricao: string }>;
  /** Capítulos SH-2 distintos no catálogo. */
  listarCapitulos(): Array<{ capitulo2: string; titulo: string }>;
  /** Posições NCM-4 distintas em um capítulo (2 dígitos). */
  listarPosicoes4(capitulo2: string): Array<{ posicao4: string; descricao: string }>;
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

function normalizarEntrada(val: string | NcmVigenteEntry): NcmVigenteEntry {
  if (typeof val === "string") {
    const folha = val.trim();
    return { folha, completa: folha };
  }
  return {
    folha: val.folha.trim(),
    completa: val.completa.trim() || val.folha.trim(),
  };
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

function pontuarBusca(
  queryTokens: Set<string>,
  folha: string,
  completa: string,
): { score: number; tokensCasados: number } {
  const tokensFolha = tokensTexto(folha);
  const tokensCompleta = tokensTexto(completa);
  let pontos = 0;
  let tokensCasados = 0;
  for (const t of queryTokens) {
    if (tokensFolha.some((d) => tokenCombina(t, d))) {
      pontos += 2;
      tokensCasados++;
      continue;
    }
    if (tokensCompleta.some((d) => tokenCombina(t, d))) {
      pontos += 1;
      tokensCasados++;
    }
  }
  if (pontos === 0) return { score: 0, tokensCasados: 0 };
  return { score: pontos / (queryTokens.size * 2), tokensCasados };
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
      if (!key || !(key in itens)) return null;
      return normalizarEntrada(itens[key]!).folha;
    },
    descricaoCompleta(ncm: string) {
      const key = normNcm8(ncm);
      if (!key || !(key in itens)) return null;
      return normalizarEntrada(itens[key]!).completa;
    },
    listarPorCapitulo(capitulo4: string) {
      const cap = capitulo4.replace(/\D/g, "").slice(0, 4);
      return Object.entries(itens)
        .filter(([k]) => k.startsWith(cap))
        .map(([ncm, raw]) => ({ ncm, descricao: normalizarEntrada(raw).folha }));
    },
    listarCapitulos() {
      const caps = new Set<string>();
      for (const ncm of Object.keys(itens)) caps.add(ncm.slice(0, 2));
      return [...caps]
        .sort()
        .map((capitulo2) => {
          const rep = Object.keys(itens).find((k) => k.startsWith(capitulo2));
          const completa = rep ? normalizarEntrada(itens[rep]!).completa : "";
          const titulo = completa.split(" > ")[0]?.trim() ?? capitulo2;
          return { capitulo2, titulo };
        });
    },
    listarPosicoes4(capitulo2: string) {
      const cap2 = capitulo2.replace(/\D/g, "").slice(0, 2);
      const pos = new Set<string>();
      for (const ncm of Object.keys(itens)) {
        if (ncm.startsWith(cap2)) pos.add(ncm.slice(0, 4));
      }
      return [...pos].sort().map((posicao4) => {
        const rep = Object.keys(itens).find((k) => k.startsWith(posicao4));
        const folha = rep ? normalizarEntrada(itens[rep]!).folha : posicao4;
        const completa = rep ? normalizarEntrada(itens[rep]!).completa : "";
        const partes = completa.split(" > ").map((p) => p.trim());
        const descricao = partes.length >= 2 ? partes[1]! : folha;
        return { posicao4, descricao };
      });
    },
    buscarPorTexto(texto: string, capitulo4?: string, limite = 5) {
      const cap = capitulo4?.replace(/\D/g, "").slice(0, 4);
      const qt = new Set(tokensTexto(texto));
      if (!qt.size) return [];
      const scored: Array<{ ncm: string; descricao: string; score: number; tokensCasados: number }> = [];
      for (const [ncm, raw] of Object.entries(itens)) {
        if (cap && !ncm.startsWith(cap)) continue;
        const { folha, completa } = normalizarEntrada(raw);
        const { score, tokensCasados } = pontuarBusca(qt, folha, completa);
        if (score === 0) continue;
        scored.push({ ncm, descricao: folha, score, tokensCasados });
      }
      return scored
        .sort((a, b) => b.score - a.score || b.tokensCasados - a.tokensCasados)
        .slice(0, limite)
        .map(({ tokensCasados: _tc, ...rest }) => rest);
    },
  };
}
