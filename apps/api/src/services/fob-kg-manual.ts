import type { AvisoValoracao, Benchmark, Item } from "@cia/shared";
import type { calibrarFobKg } from "@cia/pipeline";
import { fobKgParaPreenchimento, resolvePesoLiqRateio } from "@cia/pipeline";

type Calibracao = ReturnType<typeof calibrarFobKg>;

export function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

function fobKgBenchmarkOperacional(benchmark?: Benchmark): number | null {
  if (!benchmark) return null;
  const v = fobKgParaPreenchimento(benchmark);
  return v != null && v > 0 ? v : null;
}

/** FOB/kg de referência — planilha operacional INNOVE, depois calibrado/embarque. */
export function fobKgReferenciaItem(it: Item): number | null {
  if (it.fobPendente) return null;
  const planilha = fobKgBenchmarkOperacional(it.benchmark);
  if (planilha != null) return planilha;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  const peso = pesoEngineItem(it);
  if (peso > 0 && it.fobTotalUS > 0) return it.fobTotalUS / peso;
  return null;
}

/** FOB total US$ no engine — manual > planilha INNOVE > ComexStat > embarque. */
export function fobUsadoNoEngine(it: Item, calibracao: Calibracao): number {
  if (it.fobPendente) return 0;
  const pesoRateio = pesoEngineItem(it);
  if (it.fobKgManual != null && it.fobKgManual > 0 && pesoRateio > 0) {
    return it.fobKgManual * pesoRateio;
  }

  const fobKgPlanilha = fobKgBenchmarkOperacional(it.benchmark);
  if (fobKgPlanilha != null && pesoRateio > 0) {
    return fobKgPlanilha * pesoRateio;
  }

  if (
    it.fobTotalUS > 0 &&
    calibracao.fobKgOriginal &&
    calibracao.fobKgOriginal > 0 &&
    !calibracao.ajustado
  ) {
    return it.fobTotalUS;
  }
  if (calibracao.fobKgCalibrado > 0 && pesoRateio > 0) {
    return calibracao.fobKgCalibrado * pesoRateio;
  }
  return it.fobTotalUS;
}

/** FOB/kg efetivo após hierarquia (manual → planilha operacional → calibrado). */
export function fobKgFinalItem(it: Item, calibracao: Calibracao): number | null {
  if (it.fobPendente) return null;
  const peso = pesoEngineItem(it);
  if (peso <= 0) return null;
  return fobUsadoNoEngine(it, calibracao) / peso;
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
