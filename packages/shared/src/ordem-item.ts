import type { Item } from "./schemas.js";

/** Ordem persistida do item (campo DB). Fallback: índice no array (cotação não salva). */
export function ordemDoItem(itens: Item[], idx: number): number {
  return itens[idx]?.ordem ?? idx;
}

/** Índice no array ordenado a partir de item.ordem. */
export function idxPorOrdem(itens: Item[], ordem: number): number {
  const i = itens.findIndex((it) => it.ordem === ordem);
  if (i >= 0) return i;
  if (ordem >= 0 && ordem < itens.length) return ordem;
  return -1;
}

/** Mescla ordem/id do DB após recálculo (calcularCotacao não recria metadados persistidos). */
export function mesclarOrdemItensPersistidos<T extends Item>(calculados: T[], referencia: Item[]): T[] {
  return calculados.map((it, idx) => ({
    ...it,
    ordem: referencia[idx]?.ordem ?? it.ordem ?? idx,
    id: it.id ?? referencia[idx]?.id,
  }));
}

/** Lista divergências índice × ordem (diagnóstico). */
export function divergenciasOrdemItem(itens: Item[]): Array<{ idx: number; ordem: number; ncm: string; desc: string }> {
  return itens
    .map((it, idx) => ({
      idx,
      ordem: it.ordem ?? idx,
      ncm: it.ncm,
      desc: (it.descPt || it.descOriginal || "").slice(0, 48),
    }))
    .filter(({ idx, ordem }) => idx !== ordem);
}
