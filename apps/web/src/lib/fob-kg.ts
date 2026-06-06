import type { Item } from "./types.ts";

export function fobKgItem(it: Item) {
  if (it.calibracao) {
    return {
      principal: it.calibracao.fobKgCalibrado,
      original: it.calibracao.fobKgOriginal,
      ajustado: it.calibracao.ajustado,
    };
  }
  if (it.pesoLiqKg > 0 && it.fobTotalUS > 0) {
    return { principal: it.fobTotalUS / it.pesoLiqKg, original: null, ajustado: false };
  }
  return { principal: null, original: null, ajustado: false };
}
