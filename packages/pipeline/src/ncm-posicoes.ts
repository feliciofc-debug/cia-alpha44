/**
 * Montagem de candidatos de posição (4 dígitos) para classificação NCM em 2 passes.
 */

import type { NcmCatalog } from "./ncm-catalog.js";
import { enriquecerTextoClassificacao } from "./classificar-ncm.js";
import {
  detectarFamilias,
  prefixosDasFamilias,
  type DetectarFamiliasInput,
  type FamiliaProduto,
} from "./familias/index.js";

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

function addPrefixoAoMap(
  catalog: NcmCatalog,
  map: Map<string, PosicaoCandidata>,
  prefixo: string,
  titulo?: string,
) {
  const pre = prefixo.replace(/\D/g, "");
  if (pre.length === 4) {
    if (map.has(pre)) return;
    const pos = catalog.listarPosicoes4(pre.slice(0, 2)).find((p) => p.posicao4 === pre);
    map.set(pre, {
      posicao4: pre,
      titulo: titulo ?? pos?.descricao ?? pre,
      capitulo2: pre.slice(0, 2),
    });
    return;
  }
  if (pre.length === 2) {
    for (const p of catalog.listarPosicoes4(pre)) {
      if (map.size >= 25) break;
      if (!map.has(p.posicao4)) {
        map.set(p.posicao4, {
          posicao4: p.posicao4,
          titulo: p.descricao,
          capitulo2: pre,
        });
      }
    }
  }
}

/**
 * Candidatos do passe 1: família(s) + top-10 busca hierárquica + fallback capítulos.
 */
export function montarCandidatosPasse1(
  catalog: NcmCatalog,
  descricaoBusca: string,
  familiaLegado: FamiliaProduto | null = null,
  limite = 25,
  detectarOpts?: DetectarFamiliasInput,
): PosicaoCandidata[] {
  const deteccao = detectarOpts
    ? detectarFamilias(detectarOpts)
    : detectarFamilias({ descOriginal: descricaoBusca });
  const familias = deteccao.familias.map((f) => f.familia);
  const prefixos =
    familias.length > 0
      ? prefixosDasFamilias(familias)
      : familiaLegado
        ? prefixosDasFamilias([familiaLegado])
        : [];

  const map = new Map<string, PosicaoCandidata>();
  for (const pre of prefixos) addPrefixoAoMap(catalog, map, pre);

  const familiaEnriquecimento = familias[0] ?? familiaLegado;
  const texto = enriquecerTextoClassificacao(descricaoBusca, familiaEnriquecimento);
  const hits = catalog.buscarPorTexto(texto, undefined, 10);
  for (const h of hits) addPrefixoAoMap(catalog, map, h.ncm.slice(0, 4));

  if (map.size === 0) {
    for (const cap of catalog.listarCapitulos().slice(0, 20)) {
      for (const p of catalog.listarPosicoes4(cap.capitulo2).slice(0, 3)) {
        addPrefixoAoMap(catalog, map, p.posicao4, p.descricao);
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

export { detectarFamilias } from "./familias/index.js";
