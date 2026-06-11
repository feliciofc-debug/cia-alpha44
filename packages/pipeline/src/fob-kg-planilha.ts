/**
 * FOB/kg da planilha do embarque — prioridade sobre ComexStat.
 * Herança intra-carga só com distanciaNcm ≤ 4 (mesma posição).
 */

import type { Item } from "@cia/shared";
import { normalizarNcm } from "./benchmark.js";
import {
  detectarBasePesoFob,
  pesoParaBaseFob,
  type FobKgBase,
} from "./detectar-base-peso-fob.js";
import type { LinhaCrua } from "./linha.js";
import {
  aplicarRegrasFobItens,
  anexarMetaFobItem,
  resolverFobKgPlanilha,
  type FobKgMeta,
} from "./resolver-fob-kg.js";
import { aplicarQuantidadesLinhas } from "./qtd-linha.js";

export interface ReferenciaFobKgPlanilha {
  ncm: string;
  fobKg: number;
  fobKgBase?: FobKgBase;
}

export interface PreenchimentoFobKgPlanilha {
  ncmReferencia: string;
  fobKg: number;
}

/** Herança NCM irmão — no máximo mesma posição (4 díg.). */
export const DISTANCIA_MAX_NCM_IRMAO = 4;

/** FOB/kg calculado da própria linha (total ÷ peso base detectado). */
export function fobKgDaLinha(l: LinhaCrua, fobKgCol?: number | null): number | null {
  const fob = l.fobTotalUS ?? 0;
  if (fob <= 0) return null;
  const det = detectarBasePesoFob({
    fobTotalUS: fob,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobKgReferencia: fobKgCol,
  });
  const peso = pesoParaBaseFob(det.fobKgBase, l.pesoBrutoKg, l.pesoLiqKg);
  if (peso <= 0) return null;
  return fob / peso;
}

export function fobKgDoItem(it: Item): number | null {
  if (it.fobTotalUS <= 0) return null;
  const det = detectarBasePesoFob({
    fobTotalUS: it.fobTotalUS,
    pesoBrutoKg: it.pesoBrutoKg,
    pesoLiqKg: it.pesoLiqKg,
  });
  const peso = pesoParaBaseFob(det.fobKgBase, it.pesoBrutoKg, it.pesoLiqKg);
  if (peso <= 0) return null;
  return it.fobTotalUS / peso;
}

/** Índice NCM → FOB/kg das linhas que já têm valor na planilha. */
export function indiceFobKgPlanilha(
  linhas: LinhaCrua[],
  fobKgColPorIndice?: Map<number, number>,
): Map<string, ReferenciaFobKgPlanilha> {
  const map = new Map<string, ReferenciaFobKgPlanilha>();
  linhas.forEach((l, i) => {
    const ncm = normalizarNcm(l.ncm ?? "");
    const fobKgCol = fobKgColPorIndice?.get(i);
    const fobKg = fobKgDaLinha(l, fobKgCol);
    if (!ncm || ncm === "00000000" || !fobKg || fobKg <= 0) return;
    if (!map.has(ncm)) {
      const det = detectarBasePesoFob({
        fobTotalUS: l.fobTotalUS!,
        pesoBrutoKg: l.pesoBrutoKg,
        pesoLiqKg: l.pesoLiqKg,
        fobKgReferencia: fobKgCol,
      });
      map.set(ncm, { ncm, fobKg, fobKgBase: det.fobKgBase });
    }
  });
  return map;
}

export function indiceFobKgItens(itens: Item[]): Map<string, ReferenciaFobKgPlanilha> {
  const map = new Map<string, ReferenciaFobKgPlanilha>();
  for (const it of itens) {
    const ncm = normalizarNcm(it.ncm ?? "");
    const fobKg = fobKgDoItem(it);
    if (!ncm || ncm === "00000000" || !fobKg || fobKg <= 0) continue;
    if (!map.has(ncm)) {
      map.set(ncm, {
        ncm,
        fobKg,
        fobKgBase: it.fobKgBase,
      });
    }
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

/** Preenche FOB ausente via cascata com trava (delega ao resolver). */
export function preencherFobKgPlanilha(
  linhas: LinhaCrua[],
  benchmarkIndex?: import("./benchmark.js").BenchmarkIndex,
  fobKgColPorIndice?: Map<number, number>,
): {
  linhas: LinhaCrua[];
  preenchimentos: PreenchimentoFobKgPlanilha[];
  metas: FobKgMeta[];
} {
  const index =
    benchmarkIndex ??
    ({
      comex: new Map(),
      historico: new Map(),
      contexto: "",
    } as import("./benchmark.js").BenchmarkIndex);

  const antes = linhas.map((l) => l.fobTotalUS);
  const comQtd = aplicarQuantidadesLinhas(linhas);
  const { linhas: out, metas } = resolverFobKgPlanilha(comQtd, index, fobKgColPorIndice);
  const preenchimentos: PreenchimentoFobKgPlanilha[] = [];

  out.forEach((l, i) => {
    const tinha = (antes[i] ?? 0) > 0;
    const meta = metas[i];
    if (!tinha && (l.fobTotalUS ?? 0) > 0 && meta?.fobKgFonte.startsWith("ncm-irmao")) {
      const m = meta.fobKgFonte.match(/ncm-irmao\((\d{8})\)/);
      const fobKg = fobKgDaLinha(l, fobKgColPorIndice?.get(i));
      if (m && fobKg) preenchimentos.push({ ncmReferencia: m[1]!, fobKg });
    }
  });

  return { linhas: out, preenchimentos, metas };
}

/** Mesma regra para itens já classificados (NCM resolvido). */
export function preencherFobKgItens(
  itens: Item[],
  benchmarkIndex?: import("./benchmark.js").BenchmarkIndex,
): {
  itens: Item[];
  refsPorIndice: Map<number, ReferenciaFobKgPlanilha>;
} {
  const index =
    benchmarkIndex ??
    ({
      comex: new Map(),
      historico: new Map(),
      contexto: "",
    } as import("./benchmark.js").BenchmarkIndex);

  const resolvidos = aplicarRegrasFobItens(itens, index);
  const refsPorIndice = new Map<number, ReferenciaFobKgPlanilha>();

  resolvidos.forEach((it, i) => {
    const orig = itens[i]!;
    if (orig.fobTotalUS <= 0 && it.fobTotalUS > 0 && it.fobKgFonte?.startsWith("ncm-irmao")) {
      const m = it.fobKgFonte.match(/ncm-irmao\((\d{8})\)/);
      const fobKg = fobKgDoItem(it);
      if (m && fobKg) refsPorIndice.set(i, { ncm: m[1]!, fobKg, fobKgBase: it.fobKgBase });
    }
  });

  return { itens: resolvidos, refsPorIndice };
}

export { anexarMetaFobItem, aplicarRegrasFobItens, resolverFobKgPlanilha };
export type { FobKgMeta } from "./resolver-fob-kg.js";
