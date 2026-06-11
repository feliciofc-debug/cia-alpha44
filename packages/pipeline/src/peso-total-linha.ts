/** Cálculo de peso/qtd total a partir de colunas unitárias (layout fatura 92). */

export interface EntradaPesoLinha {
  pesoLiqTotal?: number | null;
  pesoBrutoTotal?: number | null;
  pesoLiqUnit?: number | null;
  pesoBrutoUnit?: number | null;
  qtd?: number | null;
  qtdCaixas?: number | null;
  qtdPorCaixa?: number | null;
}

export function quantidadeTotalLinha(entrada: EntradaPesoLinha): number | null {
  if (
    entrada.qtdCaixas != null &&
    entrada.qtdPorCaixa != null &&
    entrada.qtdCaixas > 0 &&
    entrada.qtdPorCaixa > 0
  ) {
    return entrada.qtdCaixas * entrada.qtdPorCaixa;
  }
  if (entrada.qtd != null && entrada.qtd > 0) return entrada.qtd;
  return null;
}

/** peso total = unitário × (qtdCaixas × qtdPorCaixa) quando totais ausentes. */
export function calcularPesosTotaisLinha(entrada: EntradaPesoLinha): {
  pesoLiqKg: number | null;
  pesoBrutoKg: number | null;
  qtd: number | null;
} {
  const qtd = quantidadeTotalLinha(entrada);

  let pesoLiqKg = entrada.pesoLiqTotal ?? null;
  let pesoBrutoKg = entrada.pesoBrutoTotal ?? null;

  if (pesoLiqKg === null && entrada.pesoLiqUnit != null && qtd != null && qtd > 0) {
    pesoLiqKg = entrada.pesoLiqUnit * qtd;
  }
  if (pesoBrutoKg === null && entrada.pesoBrutoUnit != null && qtd != null && qtd > 0) {
    pesoBrutoKg = entrada.pesoBrutoUnit * qtd;
  }

  return { pesoLiqKg, pesoBrutoKg, qtd };
}
