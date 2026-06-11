/**
 * Cascata FOB/kg com trava (T6): linha → ncm-irmao (dist≤4) → benchmark → pendente.
 */

import type { Benchmark, Item } from "@cia/shared";
import type { BenchmarkIndex } from "./benchmark.js";
import { lookupBenchmark, normalizarNcm } from "./benchmark.js";
import { fobKgParaPreenchimento } from "./benchmark-metrics.js";
import {
  detectarBasePesoFob,
  pesoParaBaseFob,
  type FobKgBase,
  type ResultadoDeteccaoBasePeso,
} from "./detectar-base-peso-fob.js";
import {
  DISTANCIA_MAX_NCM_IRMAO,
  distanciaNcm,
  fobKgNcmMaisProximo,
  indiceFobKgItens,
  indiceFobKgPlanilha,
  type ReferenciaFobKgPlanilha,
} from "./fob-kg-planilha.js";
import type { LinhaCrua } from "./linha.js";
import {
  detectarPrecoCusto,
  precoCustoUnitarioUSD,
  type TipoPrecoCusto,
} from "./preco-custo.js";

export type { FobKgBase };

export const FOB_KG_FONTE_PRECO_CUSTO = "preco-custo" as const;
export const FOB_KG_FONTE_PENDENTE = "pendente" as const;
export const FOB_KG_FONTE_LINHA = "linha" as const;

export interface FobKgMeta {
  fobKgFonte: string;
  fobPendente?: boolean;
  fobKgBase?: FobKgBase;
  fobKgAvisos?: string[];
}

export interface ResultadoResolverFobLinha {
  linha: LinhaCrua;
  meta: FobKgMeta;
}

export interface ResultadoResolverFobItem {
  item: Item;
  meta: FobKgMeta;
}

/** Re-exporta helper de mês para testes e API. */
export { extrairMesReferencia } from "./benchmark.js";

export function formatarFobKgFonteBenchmark(benchmark: Benchmark, _index: BenchmarkIndex): string | null {
  if (benchmark.rastroFonte) return benchmark.rastroFonte;
  if (benchmark.fonte === "Histórico próprio" && benchmark.fobKgMedioDI) {
    return `planilha-mensal(referencia):media-DI`;
  }
  if (benchmark.fonte === "ComexStat" && benchmark.fobKgPonderado) {
    return `comexstat(referencia):ponderada`;
  }
  return null;
}

function formatarNcmIrmao(ncm: string): string {
  return `ncm-irmao(${normalizarNcm(ncm)})`;
}

function metaPrecoCusto(tipo: TipoPrecoCusto): FobKgMeta {
  return {
    fobKgFonte: FOB_KG_FONTE_PRECO_CUSTO,
    fobKgBase: "indeterminado",
    fobKgAvisos: [`Preço de custo interno (${tipo === "moto_eletrica" ? "moto" : "patinete"} elétrico).`],
  };
}

function metaPendente(motivo: string): FobKgMeta {
  return {
    fobKgFonte: FOB_KG_FONTE_PENDENTE,
    fobPendente: true,
    fobKgBase: "indeterminado",
    fobKgAvisos: [motivo],
  };
}

function linhaTemFobExplicito(l: LinhaCrua): boolean {
  return (l.fobTotalUS ?? 0) > 0;
}

function detectarMetaLinha(l: LinhaCrua, fobKgCol?: number | null): ResultadoDeteccaoBasePeso {
  if (!linhaTemFobExplicito(l)) {
    return { fobKgBase: "indeterminado", avisos: [] };
  }
  return detectarBasePesoFob({
    fobTotalUS: l.fobTotalUS!,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobKgReferencia: fobKgCol,
  });
}

function aplicarPrecoCustoLinhaComMeta(l: LinhaCrua): ResultadoResolverFobLinha | null {
  const tipo = detectarPrecoCusto(l.descOriginal, l.ncm);
  if (!tipo) return null;
  const unit = precoCustoUnitarioUSD(tipo);
  const qtd = l.qtd != null && l.qtd > 0 ? l.qtd : 1;
  return {
    linha: { ...l, qtd, fobUnitarioUS: unit, fobTotalUS: unit * qtd },
    meta: metaPrecoCusto(tipo),
  };
}

function resolverIrmao(
  ncm: string,
  indice: Map<string, ReferenciaFobKgPlanilha>,
  peso: number,
  qtd: number | null,
  fobUnitarioUS: number | null,
): { fobTotalUS: number; fobUnitarioUS: number | null; meta: FobKgMeta } | null {
  const ref = fobKgNcmMaisProximo(ncm, indice);
  if (!ref || distanciaNcm(ncm, ref.ncm) > DISTANCIA_MAX_NCM_IRMAO) return null;
  if (peso <= 0) return null;
  const fobTotal = ref.fobKg * peso;
  return {
    fobTotalUS: fobTotal,
    fobUnitarioUS: qtd && qtd > 0 ? fobTotal / qtd : fobUnitarioUS,
    meta: {
      fobKgFonte: formatarNcmIrmao(ref.ncm),
      fobKgBase: ref.fobKgBase,
      fobKgAvisos: ref.fobKgBase === "bruto" ? ["FOB/kg herdado usa peso bruto da referência."] : undefined,
    },
  };
}

function resolverBenchmark(
  ncm: string,
  pesoLiqKg: number,
  qtd: number | null,
  fobUnitarioUS: number | null,
  index: BenchmarkIndex,
): { fobTotalUS: number; fobUnitarioUS: number | null; meta: FobKgMeta } | null {
  const bench = lookupBenchmark(index, ncm);
  const fobKg = fobKgParaPreenchimento(bench);
  const fonte = formatarFobKgFonteBenchmark(bench, index);
  if (!fonte || !fobKg || pesoLiqKg <= 0) return null;
  const avisos = ["FOB/kg de benchmark externo aplicado sobre peso líquido (base CIF)."];
  if (bench.avisoBenchmark) avisos.unshift(bench.avisoBenchmark);
  const fobTotal = fobKg * pesoLiqKg;
  return {
    fobTotalUS: fobTotal,
    fobUnitarioUS: qtd && qtd > 0 ? fobTotal / qtd : fobUnitarioUS,
    meta: {
      fobKgFonte: fonte,
      fobKgBase: "liquido",
      fobKgAvisos: avisos,
    },
  };
}

/** Resolve FOB/kg de linhas cruas (parse / montarItens). */
export function resolverFobKgPlanilha(
  linhas: LinhaCrua[],
  benchmarkIndex: BenchmarkIndex,
  fobKgColPorIndice?: Map<number, number>,
): { linhas: LinhaCrua[]; metas: FobKgMeta[] } {
  const indice = indiceFobKgPlanilha(linhas, fobKgColPorIndice);
  const metas: FobKgMeta[] = [];

  const out = linhas.map((l, i) => {
    const preco = aplicarPrecoCustoLinhaComMeta(l);
    if (preco) {
      metas.push(preco.meta);
      return preco.linha;
    }

    const fobKgCol = fobKgColPorIndice?.get(i);
    if (linhaTemFobExplicito(l)) {
      const det = detectarMetaLinha(l, fobKgCol);
      metas.push({
        fobKgFonte: FOB_KG_FONTE_LINHA,
        fobKgBase: det.fobKgBase,
        fobKgAvisos: det.avisos.length ? det.avisos : undefined,
      });
      return l;
    }

    const baseDet = detectarMetaLinha(l, fobKgCol);
    const pesoBase = pesoParaBaseFob(baseDet.fobKgBase, l.pesoBrutoKg, l.pesoLiqKg);
    const pesoLiq = l.pesoLiqKg ?? 0;

    const irmao = resolverIrmao(l.ncm ?? "", indice, pesoBase, l.qtd, l.fobUnitarioUS);
    if (irmao) {
      metas.push(irmao.meta);
      return {
        ...l,
        fobTotalUS: irmao.fobTotalUS,
        fobUnitarioUS: irmao.fobUnitarioUS,
      };
    }

    const bench = resolverBenchmark(l.ncm ?? "", pesoLiq, l.qtd, l.fobUnitarioUS, benchmarkIndex);
    if (bench) {
      metas.push(bench.meta);
      return {
        ...l,
        fobTotalUS: bench.fobTotalUS,
        fobUnitarioUS: bench.fobUnitarioUS,
      };
    }

    metas.push(
      metaPendente("FOB/kg ausente — sem linha, NCM irmão (mesma posição) ou benchmark disponível."),
    );
    return l;
  });

  return { linhas: out, metas };
}

function resolverItemInterno(
  it: Item,
  indice: Map<string, ReferenciaFobKgPlanilha>,
  benchmarkIndex: BenchmarkIndex,
): ResultadoResolverFobItem {
  const tipo = detectarPrecoCusto(it.descOriginal, it.ncm, it.descPt);
  if (tipo) {
    const unit = precoCustoUnitarioUSD(tipo);
    const qtd = it.qtd != null && it.qtd > 0 ? it.qtd : 1;
    return {
      item: { ...it, qtd, fobUnitarioUS: unit, fobTotalUS: unit * qtd },
      meta: metaPrecoCusto(tipo),
    };
  }

  if (it.fobTotalUS > 0 && it.fobKgFonte && it.fobKgFonte !== FOB_KG_FONTE_PENDENTE) {
    return {
      item: it,
      meta: {
        fobKgFonte: it.fobKgFonte,
        fobPendente: it.fobPendente,
        fobKgBase: it.fobKgBase,
        fobKgAvisos: it.fobKgAvisos,
      },
    };
  }

  if (it.fobTotalUS > 0 && !it.fobKgFonte) {
    const det = detectarBasePesoFob({
      fobTotalUS: it.fobTotalUS,
      pesoBrutoKg: it.pesoBrutoKg,
      pesoLiqKg: it.pesoLiqKg,
    });
    return {
      item: it,
      meta: {
        fobKgFonte: FOB_KG_FONTE_LINHA,
        fobKgBase: det.fobKgBase,
        fobKgAvisos: det.avisos.length ? det.avisos : undefined,
      },
    };
  }

  const baseDet = detectarBasePesoFob({
    fobTotalUS: it.fobTotalUS,
    pesoBrutoKg: it.pesoBrutoKg,
    pesoLiqKg: it.pesoLiqKg,
  });
  const pesoBase = pesoParaBaseFob(baseDet.fobKgBase, it.pesoBrutoKg, it.pesoLiqKg);
  const pesoLiq = it.pesoLiqKg ?? 0;

  const irmao = resolverIrmao(it.ncm ?? "", indice, pesoBase, it.qtd, it.fobUnitarioUS);
  if (irmao) {
    return {
      item: { ...it, fobTotalUS: irmao.fobTotalUS, fobUnitarioUS: irmao.fobUnitarioUS },
      meta: irmao.meta,
    };
  }

  const bench = resolverBenchmark(it.ncm ?? "", pesoLiq, it.qtd, it.fobUnitarioUS, benchmarkIndex);
  if (bench) {
    return {
      item: { ...it, fobTotalUS: bench.fobTotalUS, fobUnitarioUS: bench.fobUnitarioUS },
      meta: bench.meta,
    };
  }

  return {
    item: it,
    meta: metaPendente("FOB/kg ausente — sem linha, NCM irmão (mesma posição) ou benchmark disponível."),
  };
}

function aplicarMeta(it: Item, meta: FobKgMeta): Item {
  return {
    ...it,
    fobKgFonte: meta.fobKgFonte,
    fobPendente: meta.fobPendente,
    fobKgBase: meta.fobKgBase,
    fobKgAvisos: meta.fobKgAvisos,
  };
}

/** Reaplica cascata FOB/kg em recálculo (idempotente). */
export function aplicarRegrasFobItens(itens: Item[], benchmarkIndex: BenchmarkIndex): Item[] {
  const indice = indiceFobKgItens(itens);
  return itens.map((it) => {
    const r = resolverItemInterno(it, indice, benchmarkIndex);
    return aplicarMeta(r.item, r.meta);
  });
}

/** Anexa metadados FOB a item parcial (montarItens). */
export function anexarMetaFobItem(it: Item, meta: FobKgMeta): Item {
  return aplicarMeta(it, meta);
}

export { detectarBasePesoFob, pesoParaBaseFob };
