import type { AvisoValoracao, Benchmark, Item } from "@cia/shared";
import type { calibrarFobKg } from "@cia/pipeline";
import {
  analisarEscalaFobItem,
  fobKgBenchmark,
  fobTotalPlanilhaPeso,
  pesoBrutoPlanilhaFob,
  resolvePesoLiqRateio,
} from "@cia/pipeline";

type Calibracao = ReturnType<typeof calibrarFobKg>;

export function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

/** Peso bruto 毛重 para FOB DI — fallback rateio só se bruto ausente. */
export function pesoFobPlanilhaItem(it: Item, _benchmark?: Benchmark | null): number {
  const bruto = pesoBrutoPlanilhaFob({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
  if (bruto > 0) return bruto;
  return pesoEngineItem(it);
}

function fobKgBenchmarkOperacional(benchmark?: Benchmark): number | null {
  return fobKgBenchmark(benchmark);
}

/** FOB total US$ metodologia empresa: PREÇO FOB/KG × peso bruto. */
export function fobTotalPlanilhaItem(it: Item, benchmark?: Benchmark): number {
  if (it.fobPendente) return 0;
  const bench = benchmark ?? it.benchmark;
  const pesoRef = pesoFobPlanilhaItem(it, bench);
  return fobTotalPlanilhaPeso(pesoRef, bench, it.fobKgManual);
}

/** FOB/kg de referência — planilha operacional INNOVE (PREÇO FOB/KG). */
export function fobKgReferenciaItem(it: Item): number | null {
  if (it.fobPendente) return null;
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  const planilha = fobKgBenchmarkOperacional(it.benchmark);
  if (planilha != null) return planilha;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  const peso = pesoFobPlanilhaItem(it, it.benchmark);
  if (peso > 0 && it.fobTotalUS > 0) return it.fobTotalUS / peso;
  return null;
}

/**
 * FOB total US$ no motor — metodologia empresa (planilha FOB/kg × peso bruto).
 * Override manual × bruto → benchmark×bruto → fobTotalUS persistido → 0 se pendente.
 * Invoice (fobEmbarqueUS) não entra no motor; só referência/desvio na UI.
 */
export function fobUsadoNoEngine(it: Item, _calibracao: Calibracao): number {
  if (it.fobPendente) return 0;
  const bench = it.benchmark;
  const fobPlanilha = fobTotalPlanilhaItem(it, bench);
  if (fobPlanilha > 0) return fobPlanilha;
  if (it.fobTotalUS > 0) return it.fobTotalUS;
  return 0;
}

/** Desvio % do FOB/kg invoice vs referência planilha (positivo = invoice acima da DI). */
export function desvioFobKgReferenciaPct(it: Item, benchmark?: Benchmark): number | null {
  const ref = fobKgReferenciaItem({ ...it, benchmark: benchmark ?? it.benchmark });
  const peso = pesoFobPlanilhaItem(it, benchmark ?? it.benchmark);
  if (ref == null || ref <= 0 || peso <= 0) return null;
  const fobInvoice = it.fobEmbarqueUS ?? 0;
  if (fobInvoice <= 0) return null;
  const fobKgInvoice = fobInvoice / peso;
  return ((fobKgInvoice - ref) / ref) * 100;
}

export function analiseEscalaFobItem(it: Item, benchmark?: Benchmark) {
  return analisarEscalaFobItem(it, benchmark ?? it.benchmark);
}

/** FOB/kg efetivo no motor (planilha × bruto). */
export function fobKgFinalItem(it: Item, calibracao: Calibracao): number | null {
  if (it.fobPendente) return null;
  const peso = pesoFobPlanilhaItem(it, it.benchmark);
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
