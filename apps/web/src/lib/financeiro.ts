import type { ResultadoCotacao } from "./types.ts";

/**
 * Separa custo fixo de importação, impostos de venda (variáveis com markup),
 * margem da trade e total do orçamento.
 */
export interface ResumoFinanceiro {
  /**
   * Nacionalização fixa: II + IPI + PIS + COFINS + Siscomex + taxas locais.
   * Não muda ao duplicar só o markup (mesmos itens e parâmetros de entrada).
   */
  custoImportacaoBRL: number;
  /**
   * ICMS saída + DIFs + CSLL + IRRF — recalculam quando o markup muda (planilha 66).
   */
  impostosSaidaBRL: number;
  /** @deprecated use custoImportacaoBRL — mantido para compat */
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
  const impostosSaidaBRL = resultado.saida.impostosSaidaTotal;
  const custoImportacaoBRL =
    resultado.entrada.impostosEntradaTotal +
    resultado.entrada.antidumpingBRL +
    resultado.saida.taxasLocaisTotalBRL;
  const totalOrcamentoBRL = resultado.totalBRL;
  const csllBRL = resultado.saida.csll;
  const irrfBRL = resultado.saida.irrf;
  const lucroLiquidoTradeBRL = markupBRL - csllBRL - irrfBRL;

  return {
    custoImportacaoBRL,
    impostosSaidaBRL,
    custoOperacionalBRL: custoImportacaoBRL,
    markupBRL,
    markupPct,
    csllBRL,
    irrfBRL,
    lucroLiquidoTradeBRL,
    totalOrcamentoBRL,
    margemSobreCustoPct: custoImportacaoBRL > 0 ? markupBRL / custoImportacaoBRL : 0,
  };
}
