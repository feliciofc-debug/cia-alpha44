import type { LinhaCrua } from "./linha.js";

export const FONTE_CUSTO_ORFAO_VEICULO =
  "custo detectado na planilha (coluna sem cabeçalho, validado: c × qtd = t)" as const;

export interface CustoOrfaoVeiculo {
  custoUnitarioUS: number;
  fobTotalUS: number;
  fonte: typeof FONTE_CUSTO_ORFAO_VEICULO;
}

function valoresCandidatos(l: Pick<LinhaCrua, "valoresSemCabecalho">): number[] {
  return (l.valoresSemCabecalho ?? []).filter((v) => Number.isFinite(v) && v > 0);
}

export function detectarCustoOrfaoVeiculo(
  l: Pick<LinhaCrua, "qtd" | "valoresSemCabecalho">,
): CustoOrfaoVeiculo | null {
  const qtd = l.qtd != null && l.qtd > 0 ? l.qtd : null;
  if (!qtd) return null;

  const valores = valoresCandidatos(l);
  for (let i = 0; i < valores.length; i++) {
    const c = valores[i]!;
    for (let j = 0; j < valores.length; j++) {
      if (i === j) continue;
      const t = valores[j]!;
      if (t <= c) continue;
      const esperado = c * qtd;
      const tolerancia = Math.max(Math.abs(t) * 0.01, 0.01);
      if (Math.abs(t - esperado) <= tolerancia) {
        return {
          custoUnitarioUS: c,
          fobTotalUS: esperado,
          fonte: FONTE_CUSTO_ORFAO_VEICULO,
        };
      }
    }
  }

  return null;
}
