import type { ResultadoCotacao } from "@cia/fiscal-engine";

export interface ResumoFinanceiro {
  custoOperacionalBRL: number;
  markupBRL: number;
  markupPct: number;
  csllBRL: number;
  irrfBRL: number;
  lucroLiquidoTradeBRL: number;
  totalOrcamentoBRL: number;
  margemSobreCustoPct: number;
}

export function extrairResumoFinanceiro(
  resultado: ResultadoCotacao | null | undefined,
  markupPct = 0.06,
): ResumoFinanceiro | null {
  if (!resultado) return null;

  const markupBRL = resultado.saida.markup;
  const totalOrcamentoBRL = resultado.totalBRL;
  const custoOperacionalBRL = totalOrcamentoBRL - markupBRL;
  const csllBRL = resultado.saida.csll;
  const irrfBRL = resultado.saida.irrf;

  return {
    custoOperacionalBRL,
    markupBRL,
    markupPct,
    csllBRL,
    irrfBRL,
    lucroLiquidoTradeBRL: markupBRL - csllBRL - irrfBRL,
    totalOrcamentoBRL,
    margemSobreCustoPct: custoOperacionalBRL > 0 ? markupBRL / custoOperacionalBRL : 0,
  };
}
