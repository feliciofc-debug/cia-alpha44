import type { AvisoValoracao, Benchmark, Item } from "@cia/shared";
import type { calibrarFobKg } from "@cia/pipeline";
import { resolvePesoLiqRateio } from "@cia/pipeline";

type Calibracao = ReturnType<typeof calibrarFobKg>;

export function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

/** FOB/kg de referência (calibrado ou planilha) — sugestão para o input, não override. */
export function fobKgReferenciaItem(it: Item): number | null {
  if (it.fobPendente) return null;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  const peso = pesoEngineItem(it);
  if (peso > 0 && it.fobTotalUS > 0) return it.fobTotalUS / peso;
  return null;
}

/** FOB total US$ usado no engine fiscal — manual vence planilha e calibragem. */
export function fobUsadoNoEngine(it: Item, calibracao: Calibracao): number {
  if (it.fobPendente) return 0;
  const pesoRateio = pesoEngineItem(it);
  if (it.fobKgManual != null && it.fobKgManual > 0 && pesoRateio > 0) {
    return it.fobKgManual * pesoRateio;
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

/** FOB/kg efetivo após hierarquia (manual → planilha → calibrado). */
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
