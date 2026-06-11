/**
 * Montagem de candidatos de posição (4 dígitos) para classificação NCM em 2 passes.
 */

import type { NcmCatalog } from "./ncm-catalog.js";
import { detectarFamilia, enriquecerTextoClassificacao, type FamiliaProduto } from "./classificar-ncm.js";

export interface PosicaoCandidata {
  posicao4: string;
  titulo: string;
  capitulo2: string;
}

export interface Ncm8Posicao {
  ncm: string;
  folha: string;
  completa: string;
}

/**
 * Candidatos do passe 1: família + top-10 busca hierárquica + fallback capítulos.
 */
export function montarCandidatosPasse1(
  catalog: NcmCatalog,
  descricao: string,
  familia: FamiliaProduto | null = detectarFamilia(descricao),
  limite = 25,
): PosicaoCandidata[] {
  const map = new Map<string, PosicaoCandidata>();
  const add = (pos4: string, titulo?: string) => {
    if (!/^\d{4}$/.test(pos4) || map.has(pos4)) return;
    const pos = catalog.listarPosicoes4(pos4.slice(0, 2)).find((p) => p.posicao4 === pos4);
    map.set(pos4, {
      posicao4: pos4,
      titulo: titulo ?? pos?.descricao ?? pos4,
      capitulo2: pos4.slice(0, 2),
    });
  };

  if (familia?.capitulo.length === 4) {
    add(familia.capitulo);
  }

  const texto = enriquecerTextoClassificacao(descricao, familia);
  const hits = catalog.buscarPorTexto(texto, undefined, 10);
  for (const h of hits) add(h.ncm.slice(0, 4));

  if (map.size === 0) {
    for (const cap of catalog.listarCapitulos().slice(0, 20)) {
      for (const p of catalog.listarPosicoes4(cap.capitulo2).slice(0, 3)) {
        add(p.posicao4, p.descricao);
        if (map.size >= limite) break;
      }
      if (map.size >= limite) break;
    }
  }

  return [...map.values()].slice(0, limite);
}

/** Todos os NCM-8 de uma posição com descrição completa hierárquica. */
export function listarNcm8DaPosicao(catalog: NcmCatalog, posicao4: string): Ncm8Posicao[] {
  const pos = posicao4.replace(/\D/g, "").slice(0, 4);
  return catalog
    .listarPorCapitulo(pos)
    .filter(({ ncm }) => ncm.startsWith(pos) && ncm.length === 8)
    .map(({ ncm, descricao: folha }) => ({
      ncm,
      folha,
      completa: catalog.descricaoCompleta(ncm) ?? folha,
    }))
    .sort((a, b) => a.ncm.localeCompare(b.ncm));
}
