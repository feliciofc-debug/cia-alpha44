import type { ResultadoCotacao } from "@cia/fiscal-engine";

export interface ResumoFinanceiro {
  custoImportacaoBRL: number;
  impostosSaidaBRL: number;
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

  return {
    custoImportacaoBRL,
    impostosSaidaBRL,
    custoOperacionalBRL: custoImportacaoBRL,
    markupBRL,
    markupPct,
    csllBRL: resultado.saida.csll,
    irrfBRL: resultado.saida.irrf,
    lucroLiquidoTradeBRL: markupBRL - resultado.saida.csll - resultado.saida.irrf,
    totalOrcamentoBRL: resultado.totalBRL,
    margemSobreCustoPct: custoImportacaoBRL > 0 ? markupBRL / custoImportacaoBRL : 0,
  };
}
