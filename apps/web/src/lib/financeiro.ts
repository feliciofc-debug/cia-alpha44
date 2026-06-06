import type { ResultadoCotacao } from "./types.ts";

/** Separa custo da operação, margem da trade e total do orçamento. */
export interface ResumoFinanceiro {
  /** II + IPI + PIS + COFINS + Siscomex + taxas + impostos saída (sem markup). */
  custoOperacionalBRL: number;
  /** Margem bruta da trade (markup sobre custo nacionalizado). */
  markupBRL: number;
  markupPct: number;
  csllBRL: number;
  irrfBRL: number;
  /** Markup menos CSLL e IRRF (o que a trade efetivamente retém). */
  lucroLiquidoTradeBRL: number;
  /** Custo + markup = total do orçamento apresentado ao cliente. */
  totalOrcamentoBRL: number;
  /** markup / custo operacional */
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
  const lucroLiquidoTradeBRL = markupBRL - csllBRL - irrfBRL;

  return {
    custoOperacionalBRL,
    markupBRL,
    markupPct,
    csllBRL,
    irrfBRL,
    lucroLiquidoTradeBRL,
    totalOrcamentoBRL,
    margemSobreCustoPct: custoOperacionalBRL > 0 ? markupBRL / custoOperacionalBRL : 0,
  };
}
