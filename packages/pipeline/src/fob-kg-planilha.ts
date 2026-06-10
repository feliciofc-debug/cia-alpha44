/**
 * FOB/kg da planilha do embarque — prioridade sobre ComexStat.
 * Se a linha não tiver FOB/kg, usa o da linha com NCM mais próximo na mesma carga.
 */

import { normalizarNcm } from "./benchmark.js";
import { detectarPrecoCusto } from "./preco-custo.js";
import { resolvePesoLiqLinha, type LinhaCrua } from "./linha.js";
import type { Item } from "@cia/shared";

export interface ReferenciaFobKgPlanilha {
  ncm: string;
  fobKg: number;
}

export interface PreenchimentoFobKgPlanilha {
  ncmReferencia: string;
  fobKg: number;
}

/** FOB/kg calculado da própria linha (total ÷ peso). */
export function fobKgDaLinha(l: LinhaCrua): number | null {
  const peso = resolvePesoLiqLinha(l);
  const fob = l.fobTotalUS ?? 0;
  if (fob > 0 && peso > 0) return fob / peso;
  return null;
}

export function fobKgDoItem(it: Item): number | null {
  if (it.fobTotalUS > 0 && it.pesoLiqKg > 0) return it.fobTotalUS / it.pesoLiqKg;
  return null;
}

/** Índice NCM → FOB/kg das linhas que já têm valor na planilha. */
export function indiceFobKgPlanilha(linhas: LinhaCrua[]): Map<string, ReferenciaFobKgPlanilha> {
  const map = new Map<string, ReferenciaFobKgPlanilha>();
  for (const l of linhas) {
    const ncm = normalizarNcm(l.ncm ?? "");
    const fobKg = fobKgDaLinha(l);
    if (!ncm || ncm === "00000000" || !fobKg || fobKg <= 0) continue;
    if (!map.has(ncm)) map.set(ncm, { ncm, fobKg });
  }
  return map;
}

export function indiceFobKgItens(itens: Item[]): Map<string, ReferenciaFobKgPlanilha> {
  const map = new Map<string, ReferenciaFobKgPlanilha>();
  for (const it of itens) {
    const ncm = normalizarNcm(it.ncm ?? "");
    const fobKg = fobKgDoItem(it);
    if (!ncm || ncm === "00000000" || !fobKg || fobKg <= 0) continue;
    if (!map.has(ncm)) map.set(ncm, { ncm, fobKg });
  }
  return map;
}

/** Distância entre NCMs — quanto menor, mais próximo (prioriza prefixos 8→6→4→2 dígitos). */
export function distanciaNcm(a: string, b: string): number {
  if (a === b) return 0;
  for (const len of [8, 6, 4, 2] as const) {
    if (a.slice(0, len) === b.slice(0, len)) return 8 - len;
  }
  return 9;
}

/** NCM com FOB/kg na planilha mais próximo do alvo (exato primeiro). */
export function fobKgNcmMaisProximo(
  ncmAlvo: string,
  indice: Map<string, ReferenciaFobKgPlanilha>,
): ReferenciaFobKgPlanilha | null {
  const alvo = normalizarNcm(ncmAlvo);
  if (!alvo || alvo === "00000000" || indice.size === 0) return null;
  const exato = indice.get(alvo);
  if (exato) return exato;

  let best: ReferenciaFobKgPlanilha | null = null;
  let bestDist = Infinity;
  for (const ref of indice.values()) {
    const d = distanciaNcm(alvo, ref.ncm);
    if (d < bestDist) {
      bestDist = d;
      best = ref;
    }
  }
  return best;
}

function linhaTemFob(l: LinhaCrua): boolean {
  return (l.fobTotalUS ?? 0) > 0 && fobKgDaLinha(l) !== null;
}

/** Preenche FOB total ausente com FOB/kg do NCM mais próximo na mesma planilha. */
export function preencherFobKgPlanilha(linhas: LinhaCrua[]): {
  linhas: LinhaCrua[];
  preenchimentos: PreenchimentoFobKgPlanilha[];
} {
  const indice = indiceFobKgPlanilha(linhas);
  const preenchimentos: PreenchimentoFobKgPlanilha[] = [];

  const out = linhas.map((l) => {
    if (linhaTemFob(l) || detectarPrecoCusto(l.descOriginal, l.ncm)) return l;
    const ref = fobKgNcmMaisProximo(l.ncm ?? "", indice);
    if (!ref) return l;
    const peso = resolvePesoLiqLinha(l);
    if (peso <= 0) return l;
    const fobTotal = ref.fobKg * peso;
    preenchimentos.push({ ncmReferencia: ref.ncm, fobKg: ref.fobKg });
    return {
      ...l,
      fobTotalUS: fobTotal,
      fobUnitarioUS: l.qtd && l.qtd > 0 ? fobTotal / l.qtd : l.fobUnitarioUS,
    };
  });

  return { linhas: out, preenchimentos };
}

/** Mesma regra para itens já classificados (NCM resolvido). */
export function preencherFobKgItens(itens: Item[]): {
  itens: Item[];
  refsPorIndice: Map<number, ReferenciaFobKgPlanilha>;
} {
  const indice = indiceFobKgItens(itens);
  const refsPorIndice = new Map<number, ReferenciaFobKgPlanilha>();

  const out = itens.map((it, i) => {
    if (fobKgDoItem(it) !== null && it.fobTotalUS > 0) return it;
    if (detectarPrecoCusto(it.descOriginal, it.ncm)) return it;
    const ref = fobKgNcmMaisProximo(it.ncm ?? "", indice);
    if (!ref || it.pesoLiqKg <= 0) return it;
    refsPorIndice.set(i, ref);
    const fobTotal = ref.fobKg * it.pesoLiqKg;
    return {
      ...it,
      fobTotalUS: fobTotal,
      fobUnitarioUS: it.qtd && it.qtd > 0 ? fobTotal / it.qtd : it.fobUnitarioUS,
    };
  });

  return { itens: out, refsPorIndice };
}
