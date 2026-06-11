/**
 * Desempate pró-específico: penaliza folha genérica "Outros/Outras" quando houver
 * código específico com score >= 80% do melhor candidato.
 */

import type { NcmCatalog } from "./ncm-catalog.js";

export function isFolhaGenericaOutros(descricao: string | null | undefined): boolean {
  if (!descricao) return false;
  return /^(outros|outras)\.?$/i.test(descricao.trim());
}

export function aplicarDesempateOutros<T extends { ncm: string; score: number }>(
  catalog: NcmCatalog,
  ordenados: T[],
): T[] {
  if (ordenados.length < 2) return ordenados;

  const maxScore = Math.max(...ordenados.map((o) => o.score));
  if (maxScore <= 0) return ordenados;

  return [...ordenados]
    .map((item) => {
      const folha = catalog.descricao(item.ncm) ?? "";
      if (!isFolhaGenericaOutros(folha)) return item;

      const temEspecifico = ordenados.some(
        (o) =>
          o.ncm !== item.ncm &&
          !isFolhaGenericaOutros(catalog.descricao(o.ncm)) &&
          o.score >= 0.8 * maxScore,
      );
      if (temEspecifico) return { ...item, score: item.score * 0.79 };
      return item;
    })
    .sort((a, b) => b.score - a.score);
}
