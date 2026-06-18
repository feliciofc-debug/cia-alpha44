import type { Item } from "./types.ts";

/** FOB/kg de referência (calibrado ou planilha) — sugestão para o input. */
export function fobKgReferencia(it: Item): number | null {
  if (it.fobPendente) return null;
  if (it.calibracao?.fobKgCalibrado != null && it.calibracao.fobKgCalibrado > 0) {
    return it.calibracao.fobKgCalibrado;
  }
  if (it.pesoLiqKg > 0 && it.fobTotalUS > 0) return it.fobTotalUS / it.pesoLiqKg;
  return null;
}

export function fobKgItem(it: Item) {
  const referencia = fobKgReferencia(it);
  const manual =
    it.fobKgManual != null && it.fobKgManual > 0 ? it.fobKgManual : null;
  return {
    principal: manual ?? referencia,
    referencia,
    manual,
    manualAtivo: manual != null,
    original: it.calibracao?.fobKgOriginal,
    ajustado: Boolean(it.calibracao?.ajustado && !manual),
  };
}

export function usdKg(n: number) {
  return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/kg`;
}
