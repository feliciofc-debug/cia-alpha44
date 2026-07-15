/** Cálculo de peso/qtd total a partir de colunas unitárias (layout fatura 92). */

export interface EntradaPesoLinha {
  pesoLiqTotal?: number | null;
  pesoBrutoTotal?: number | null;
  pesoLiqUnit?: number | null;
  pesoBrutoUnit?: number | null;
  qtd?: number | null;
  qtdCaixas?: number | null;
  qtdPorCaixa?: number | null;
  /** 毛重 por caixa (não por peça) — multiplica por qtdCaixas, nunca por qtd total. */
  pesoUnitarioPorCaixa?: boolean;
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
  pesoLiqFromUnit: boolean;
  pesoBrutoFromUnit: boolean;
} {
  const qtd = quantidadeTotalLinha(entrada);

  let pesoLiqKg = entrada.pesoLiqTotal ?? null;
  let pesoBrutoKg = entrada.pesoBrutoTotal ?? null;
  let pesoLiqFromUnit = false;
  let pesoBrutoFromUnit = false;

  if (pesoLiqKg === null && entrada.pesoLiqUnit != null) {
    const mult =
      entrada.pesoUnitarioPorCaixa && entrada.qtdCaixas != null && entrada.qtdCaixas > 0
        ? entrada.qtdCaixas
        : qtd;
    if (mult != null && mult > 0) {
      pesoLiqKg = entrada.pesoLiqUnit * mult;
      pesoLiqFromUnit = true;
    }
  }
  if (pesoBrutoKg === null && entrada.pesoBrutoUnit != null) {
    const mult =
      entrada.pesoUnitarioPorCaixa && entrada.qtdCaixas != null && entrada.qtdCaixas > 0
        ? entrada.qtdCaixas
        : qtd;
    if (mult != null && mult > 0) {
      pesoBrutoKg = entrada.pesoBrutoUnit * mult;
      pesoBrutoFromUnit = true;
    }
  }

  return { pesoLiqKg, pesoBrutoKg, qtd, pesoLiqFromUnit, pesoBrutoFromUnit };
}
