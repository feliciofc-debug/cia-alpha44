/**
 * Cascata FOB/kg com trava (T6): linha → ncm-irmao (dist≤4) → benchmark → pendente.
 */

import type { Benchmark, Item } from "@cia/shared";
import type { BenchmarkIndex } from "./benchmark.js";
import { lookupBenchmark, normalizarNcm } from "./benchmark.js";

function fonteSubstituivelPorPlanilha(fonte?: string): boolean {
  if (!fonte || fonte === FOB_KG_FONTE_PENDENTE) return false;
  if (fonte === FOB_KG_FONTE_LINHA) return true;
  return fonte.startsWith("comexstat") || fonte.startsWith("ncm-irmao(");
}

function planilhaChinaTemNcm(index: BenchmarkIndex, ncm: string): boolean {
  return lookupBenchmark(index, ncm).fonte === "Histórico próprio";
}
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
import { pesoBrutoPlanilhaFob, resolvePesoLiqRateio } from "./linha.js";
import { linhaPesoAbsurdo, ncmSuspeitoLixo } from "./fob-escala.js";
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
  /** FOB US$ original da invoice embarque — congelado na 1ª importação. */
  fobEmbarqueUS?: number;
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
  const tipo = detectarPrecoCusto({
    descOriginal: l.descOriginal,
    ncm: l.ncm,
    uso: l.uso,
    pesoLiqKg: l.pesoLiqKg,
    pesoBrutoKg: l.pesoBrutoKg,
    qtd: l.qtd,
  });
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

function pesoRateioItem(it: Pick<Item, "pesoLiqKg" | "pesoBrutoKg">): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

/** Peso bruto total da linha — regra FOB planilha China (PREÇO FOB/KG × 毛重). */
function pesoBrutoFobItem(it: Pick<Item, "pesoLiqKg" | "pesoBrutoKg">): number {
  return pesoBrutoPlanilhaFob({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

function pesoBrutoFobLinha(l: Pick<LinhaCrua, "pesoLiqKg" | "pesoBrutoKg">): number {
  return pesoBrutoPlanilhaFob({ pesoLiqKg: l.pesoLiqKg, pesoBrutoKg: l.pesoBrutoKg });
}

function fobEmbarqueItem(it: Item): number {
  if (it.fobEmbarqueUS != null && it.fobEmbarqueUS > 0) return it.fobEmbarqueUS;
  if (it.fobTotalUS > 0) return it.fobTotalUS;
  return 0;
}

function resolverBenchmark(
  ncm: string,
  pesoKg: number,
  qtd: number | null,
  fobUnitarioUS: number | null,
  index: BenchmarkIndex,
  opts?: { planilhaChina?: boolean },
): { fobTotalUS: number; fobUnitarioUS: number | null; meta: FobKgMeta } | null {
  const bench = lookupBenchmark(index, ncm);
  const fobKg = fobKgParaPreenchimento(bench);
  const fonte = formatarFobKgFonteBenchmark(bench, index);
  if (!fonte || !fobKg || pesoKg <= 0) return null;
  const planilhaChina = opts?.planilhaChina === true;
  const avisos = planilhaChina
    ? ["FOB/kg planilha China × peso bruto total da linha (毛重)."]
    : ["FOB/kg de benchmark externo aplicado sobre peso de rateio (base CIF)."];
  if (bench.avisoBenchmark) avisos.unshift(bench.avisoBenchmark);
  const fobTotal = fobKg * pesoKg;
  return {
    fobTotalUS: fobTotal,
    fobUnitarioUS: qtd && qtd > 0 ? fobTotal / qtd : fobUnitarioUS,
    meta: {
      fobKgFonte: fonte,
      fobKgBase: planilhaChina ? "bruto" : "liquido",
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
    if (linhaPesoAbsurdo(l) || ncmSuspeitoLixo(l.ncm ?? "")) {
      metas.push(
        metaPendente(
          `Linha com peso/NCM inválido — não aplicar planilha×peso (NCM ${l.ncm ?? "—"}).`,
        ),
      );
      return l;
    }

    const preco = aplicarPrecoCustoLinhaComMeta(l);
    if (preco) {
      metas.push(preco.meta);
      return preco.linha;
    }

    const fobKgCol = fobKgColPorIndice?.get(i);
    const baseDetLinha = detectarMetaLinha(l, fobKgCol);
    const pesoBaseLinha = pesoParaBaseFob(baseDetLinha.fobKgBase, l.pesoBrutoKg, l.pesoLiqKg);
    const pesoRateio = resolvePesoLiqRateio(l);

    /** 1) Planilha China (PREÇO FOB/KG ref.) · 2) embarque · 3) ComexStat · 4) NCM irmão. */
    if (planilhaChinaTemNcm(benchmarkIndex, l.ncm ?? "")) {
      if (linhaPesoAbsurdo(l) || ncmSuspeitoLixo(l.ncm ?? "")) {
        metas.push(
          metaPendente(
            `Linha com peso/NCM inválido — não aplicar planilha×peso (peso ${pesoRateio.toLocaleString("en-US")} kg).`,
          ),
        );
        return l;
      }
      const benchChina = resolverBenchmark(
        l.ncm ?? "",
        pesoBrutoFobLinha(l),
        l.qtd,
        l.fobUnitarioUS,
        benchmarkIndex,
        { planilhaChina: true },
      );
      if (benchChina) {
        const embarque = linhaTemFobExplicito(l) ? l.fobTotalUS! : undefined;
        metas.push({ ...benchChina.meta, ...(embarque != null ? { fobEmbarqueUS: embarque } : {}) });
        return {
          ...l,
          fobTotalUS: benchChina.fobTotalUS,
          fobUnitarioUS: benchChina.fobUnitarioUS,
        };
      }
    }

    if (linhaTemFobExplicito(l)) {
      const avisos = [...baseDetLinha.avisos];
      if (l.avisosQtd?.length) avisos.push(...l.avisosQtd);
      metas.push({
        fobKgFonte: FOB_KG_FONTE_LINHA,
        fobKgBase: baseDetLinha.fobKgBase,
        fobKgAvisos: avisos.length ? avisos : undefined,
      });
      return l;
    }

    const pesoBase = pesoBaseLinha;

    const bench = resolverBenchmark(l.ncm ?? "", pesoRateio, l.qtd, l.fobUnitarioUS, benchmarkIndex);
    if (bench) {
      metas.push(bench.meta);
      return {
        ...l,
        fobTotalUS: bench.fobTotalUS,
        fobUnitarioUS: bench.fobUnitarioUS,
      };
    }

    const irmao = resolverIrmao(l.ncm ?? "", indice, pesoBase, l.qtd, l.fobUnitarioUS);
    if (irmao) {
      metas.push(irmao.meta);
      return {
        ...l,
        fobTotalUS: irmao.fobTotalUS,
        fobUnitarioUS: irmao.fobUnitarioUS,
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
  if (linhaPesoAbsurdo(it) || ncmSuspeitoLixo(it.ncm ?? "")) {
    const pesoRateio = pesoRateioItem(it);
    return {
      item: { ...it, fobPendente: true, fobTotalUS: 0 },
      meta: metaPendente(
        `Linha com escala inválida (peso ${pesoRateio.toLocaleString("en-US")} kg ou NCM suspeito ${it.ncm}) — revisar embarque.`,
      ),
    };
  }

  const tipo = detectarPrecoCusto({
    descOriginal: it.descOriginal,
    ncm: it.ncm,
    uso: it.uso,
    pesoLiqKg: it.pesoLiqKg,
    pesoBrutoKg: it.pesoBrutoKg,
    qtd: it.qtd,
  });
  if (tipo) {
    const unit = precoCustoUnitarioUSD(tipo);
    const qtd = it.qtd != null && it.qtd > 0 ? it.qtd : 1;
    return {
      item: { ...it, qtd, fobUnitarioUS: unit, fobTotalUS: unit * qtd },
      meta: metaPrecoCusto(tipo),
    };
  }

  if (it.fobKgManual != null && it.fobKgManual > 0) {
    return {
      item: it,
      meta: {
        fobKgFonte: it.fobKgFonte ?? FOB_KG_FONTE_LINHA,
        fobPendente: it.fobPendente,
        fobKgBase: it.fobKgBase,
        fobKgAvisos: it.fobKgAvisos,
      },
    };
  }

  if (planilhaChinaTemNcm(benchmarkIndex, it.ncm ?? "")) {
    const benchChina = resolverBenchmark(
      it.ncm ?? "",
      pesoBrutoFobItem(it),
      it.qtd,
      it.fobUnitarioUS,
      benchmarkIndex,
      { planilhaChina: true },
    );
    if (benchChina) {
      const embarqueAnterior =
        it.fobEmbarqueUS ??
        (fobEmbarqueItem(it) > 0 && Math.abs(fobEmbarqueItem(it) - benchChina.fobTotalUS) > 0.01
          ? fobEmbarqueItem(it)
          : undefined);
      return {
        item: {
          ...it,
          fobTotalUS: benchChina.fobTotalUS,
          fobUnitarioUS: benchChina.fobUnitarioUS,
          fobPendente: false,
          ...(embarqueAnterior != null ? { fobEmbarqueUS: embarqueAnterior } : {}),
        },
        meta: {
          ...benchChina.meta,
          ...(embarqueAnterior != null ? { fobEmbarqueUS: embarqueAnterior } : {}),
        },
      };
    }
  }

  if (it.fobTotalUS > 0 && it.fobKgFonte && it.fobKgFonte !== FOB_KG_FONTE_PENDENTE) {
    const benchPlanilha = lookupBenchmark(benchmarkIndex, it.ncm ?? "");
    if (benchPlanilha.fonte !== "Histórico próprio" || !fonteSubstituivelPorPlanilha(it.fobKgFonte)) {
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
  const pesoRateio = pesoRateioItem(it);

  const bench = resolverBenchmark(it.ncm ?? "", pesoRateio, it.qtd, it.fobUnitarioUS, benchmarkIndex);
  if (bench) {
    return {
      item: { ...it, fobTotalUS: bench.fobTotalUS, fobUnitarioUS: bench.fobUnitarioUS },
      meta: bench.meta,
    };
  }

  const irmao = resolverIrmao(it.ncm ?? "", indice, pesoBase, it.qtd, it.fobUnitarioUS);
  if (irmao) {
    return {
      item: { ...it, fobTotalUS: irmao.fobTotalUS, fobUnitarioUS: irmao.fobUnitarioUS },
      meta: irmao.meta,
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
    fobEmbarqueUS: meta.fobEmbarqueUS ?? it.fobEmbarqueUS,
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
