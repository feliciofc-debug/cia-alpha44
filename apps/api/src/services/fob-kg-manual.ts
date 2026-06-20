import type { AvisoValoracao, Benchmark, Item } from "@cia/shared";
import type { calibrarFobKg } from "@cia/pipeline";
import {
  analisarEscalaFobItem,
  fobKgBenchmark,
  fobTotalPlanilhaPeso,
  ncmNaPlanilhaChina,
  pesoBrutoPlanilhaFob,
  resolvePesoLiqRateio,
} from "@cia/pipeline";

type Calibracao = ReturnType<typeof calibrarFobKg>;

export function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

/** Peso para FOB planilha China — só bruto total da linha (毛重), nunca líq ni qtd. */
export function pesoFobPlanilhaItem(it: Item, benchmark?: Benchmark | null): number {
  const bench = benchmark ?? it.benchmark;
  if (bench && ncmNaPlanilhaChina(bench)) {
    return pesoBrutoPlanilhaFob({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
  }
  return pesoEngineItem(it);
}

function fobKgBenchmarkOperacional(benchmark?: Benchmark): number | null {
  return fobKgBenchmark(benchmark);
}

/** FOB total US$ de referência (planilha China / ComexStat × peso) — NÃO entra no motor. */
export function fobTotalPlanilhaItem(it: Item, benchmark?: Benchmark): number {
  if (it.fobPendente) return 0;
  const bench = benchmark ?? it.benchmark;
  const pesoFob = pesoFobPlanilhaItem(it, bench);
  return fobTotalPlanilhaPeso(pesoFob, bench, it.fobKgManual);
}

/** FOB/kg de referência — planilha operacional INNOVE (exibição + alerta de desvio). */
export function fobKgReferenciaItem(it: Item): number | null {
  if (it.fobPendente) return null;
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  const planilha = fobKgBenchmarkOperacional(it.benchmark);
  if (planilha != null) return planilha;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  const peso = pesoFobPlanilhaItem(it);
  if (peso > 0 && (it.fobEmbarqueUS ?? 0) > 0) return (it.fobEmbarqueUS ?? 0) / peso;
  return null;
}

/**
 * FOB total US$ no motor — planilha China (NCM identificado) × peso bruto total.
 * manual×peso → planilha×pesoBruto → fobTotalUS (ComexStat/irmão) → 0 se pendente.
 */
export function fobUsadoNoEngine(it: Item, _calibracao: Calibracao): number {
  if (it.fobPendente) return 0;
  const bench = it.benchmark;
  const pesoFob = pesoFobPlanilhaItem(it, bench);

  if (it.fobKgManual != null && it.fobKgManual > 0 && pesoFob > 0) {
    return it.fobKgManual * pesoFob;
  }

  const planilha = fobKgBenchmarkOperacional(bench);
  if (planilha != null && planilha > 0 && pesoFob > 0) {
    return planilha * pesoFob;
  }

  if (it.fobTotalUS > 0) {
    return it.fobTotalUS;
  }

  return 0;
}

/** Desvio % do FOB/kg invoice vs referência planilha (positivo = invoice acima da DI). */
export function desvioFobKgReferenciaPct(it: Item, benchmark?: Benchmark): number | null {
  const ref = fobKgReferenciaItem({ ...it, benchmark: benchmark ?? it.benchmark });
  const peso = pesoFobPlanilhaItem(it, benchmark ?? it.benchmark);
  if (ref == null || ref <= 0 || peso <= 0) return null;
  const fobInvoice = fobUsadoNoEngine(it, it.calibracao ?? ({} as Calibracao));
  if (fobInvoice <= 0) return null;
  const fobKgInvoice = fobInvoice / peso;
  return ((fobKgInvoice - ref) / ref) * 100;
}

export function analiseEscalaFobItem(it: Item, benchmark?: Benchmark) {
  return analisarEscalaFobItem(it, benchmark ?? it.benchmark);
}

/** FOB/kg efetivo no motor (planilha × bruto ou manual). */
export function fobKgFinalItem(it: Item, calibracao: Calibracao): number | null {
  if (it.fobPendente) return null;
  const peso = pesoFobPlanilhaItem(it);
  if (peso <= 0) return null;
  const fob = fobUsadoNoEngine(it, calibracao);
  return fob > 0 ? fob / peso : null;
}

export function calcAvisoValoracaoFobKg(
  fobKgManual: number,
  benchmark?: Benchmark,
): AvisoValoracao | null {
  const piso = benchmark?.pisoDefensavel;
  if (piso == null || piso <= 0 || fobKgManual >= piso) return null;
  return {
    abaixoDoDefensavel: true,
    pisoDefensavel: piso,
    percentualAbaixo: ((piso - fobKgManual) / piso) * 100,
  };
}
