import type { AvisoValoracao, Benchmark, Item } from "@cia/shared";
import type { calibrarFobKg } from "@cia/pipeline";
import {
  analisarEscalaFobItem,
  fobKgBenchmark,
  fobTotalPlanilhaPeso,
  resolvePesoLiqRateio,
} from "@cia/pipeline";

type Calibracao = ReturnType<typeof calibrarFobKg>;

export function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

function fobKgBenchmarkOperacional(benchmark?: Benchmark): number | null {
  return fobKgBenchmark(benchmark);
}

/** FOB total US$ de referência (planilha China / ComexStat × peso) — NÃO entra no motor. */
export function fobTotalPlanilhaItem(it: Item, benchmark?: Benchmark): number {
  if (it.fobPendente) return 0;
  const pesoRateio = pesoEngineItem(it);
  return fobTotalPlanilhaPeso(pesoRateio, benchmark ?? it.benchmark, it.fobKgManual);
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
  const peso = pesoEngineItem(it);
  if (peso > 0 && (it.fobEmbarqueUS ?? 0) > 0) return (it.fobEmbarqueUS ?? 0) / peso;
  return null;
}

/**
 * FOB total US$ no motor (base fiscal v2 — invoice Paulo / planilha 66).
 * manual×peso → fobEmbarqueUS (invoice) → fobTotalUS válido → 0 se pendente.
 * Planilha China NUNCA entra aqui.
 */
export function fobUsadoNoEngine(it: Item, _calibracao: Calibracao): number {
  if (it.fobPendente) return 0;
  const pesoRateio = pesoEngineItem(it);

  if (it.fobKgManual != null && it.fobKgManual > 0 && pesoRateio > 0) {
    return it.fobKgManual * pesoRateio;
  }

  if (it.fobEmbarqueUS != null && it.fobEmbarqueUS > 0) {
    return it.fobEmbarqueUS;
  }

  if (it.fobTotalUS > 0) {
    return it.fobTotalUS;
  }

  return 0;
}

/** Desvio % do FOB/kg invoice vs referência planilha (positivo = invoice acima da DI). */
export function desvioFobKgReferenciaPct(it: Item, benchmark?: Benchmark): number | null {
  const ref = fobKgReferenciaItem({ ...it, benchmark: benchmark ?? it.benchmark });
  const peso = pesoEngineItem(it);
  if (ref == null || ref <= 0 || peso <= 0) return null;
  const fobInvoice = fobUsadoNoEngine(it, it.calibracao ?? ({} as Calibracao));
  if (fobInvoice <= 0) return null;
  const fobKgInvoice = fobInvoice / peso;
  return ((fobKgInvoice - ref) / ref) * 100;
}

export function analiseEscalaFobItem(it: Item, benchmark?: Benchmark) {
  return analisarEscalaFobItem(it, benchmark ?? it.benchmark);
}

/** FOB/kg efetivo no motor (invoice ou manual). */
export function fobKgFinalItem(it: Item, calibracao: Calibracao): number | null {
  if (it.fobPendente) return null;
  const peso = pesoEngineItem(it);
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
