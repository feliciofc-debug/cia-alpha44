import type { Item } from "./types.ts";

function fobKgPlanilhaOperacional(it: Item): number | null {
  if (!it.benchmark) return null;
  if (it.benchmark.fonte === "Histórico próprio") {
    const v = it.benchmark.fobKgMedioDI ?? it.benchmark.mediaFobKg;
    return v != null && v > 0 ? v : null;
  }
  if (it.benchmark.fonte === "ComexStat") {
    return it.benchmark.fobKgPonderado ?? null;
  }
  return it.benchmark.fobKgMedioDI ?? it.benchmark.mediaFobKg ?? null;
}

/** FOB/kg de referência — planilha INNOVE (IMPORTAÇÕES DA CHINA), depois calibrado/embarque. */
export function fobKgReferencia(it: Item): number | null {
  if (it.fobPendente) return null;
  const planilha = fobKgPlanilhaOperacional(it);
  if (planilha != null) return planilha;
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
  const planilha = fobKgPlanilhaOperacional(it);
  return {
    principal: manual ?? referencia,
    referencia,
    manual,
    manualAtivo: manual != null,
    planilhaOperacional: planilha,
    original: it.calibracao?.fobKgOriginal,
    ajustado: Boolean(it.calibracao?.ajustado && !manual && planilha == null),
  };
}

export function usdKg(n: number) {
  return `$ ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}/kg`;
}
