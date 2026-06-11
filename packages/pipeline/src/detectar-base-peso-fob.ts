/**
 * Detecção da base de peso usada no FOB/kg da planilha (bruto vs líquido).
 * Caso real fatura 16: fobKg 2,109588 × peso bruto = fobTotal.
 */

export type FobKgBase = "bruto" | "liquido" | "indeterminado";

export const TOLERANCIA_RECONCILIACAO_FOB = 0.005;

export interface EntradaDeteccaoBasePeso {
  fobTotalUS: number;
  pesoBrutoKg: number | null;
  pesoLiqKg: number | null;
  /** Coluna FOB/kg da planilha (ex.: 2,109588) — quando disponível. */
  fobKgReferencia?: number | null;
}

export interface ResultadoDeteccaoBasePeso {
  fobKgBase: FobKgBase;
  avisos: string[];
}

const AVISO_RECONCILIACAO =
  "FOB total não reconcilia com nenhum peso — verificar linha da planilha";

const AVISO_BRUTO_CIF =
  "FOB/kg da planilha usa peso bruto; CIF aduaneiro rateia peso líquido";

function relErr(fobTotal: number, calculado: number): number {
  if (fobTotal <= 0) return 1;
  return Math.abs(fobTotal - calculado) / fobTotal;
}

/** Peso efetivo para multiplicar FOB/kg conforme base detectada. */
export function pesoParaBaseFob(
  base: FobKgBase,
  pesoBrutoKg: number | null,
  pesoLiqKg: number | null,
): number {
  const bruto = pesoBrutoKg ?? 0;
  const liq = pesoLiqKg ?? 0;
  if (base === "bruto" && bruto > 0) return bruto;
  if (base === "liquido" && liq > 0) return liq;
  if (bruto > 0) return bruto;
  if (liq > 0) return liq;
  return 0;
}

export function detectarBasePesoFob(entrada: EntradaDeteccaoBasePeso): ResultadoDeteccaoBasePeso {
  const { fobTotalUS, pesoBrutoKg, pesoLiqKg, fobKgReferencia } = entrada;
  const avisos: string[] = [];
  const bruto = pesoBrutoKg ?? 0;
  const liq = pesoLiqKg ?? 0;

  if (fobTotalUS <= 0) {
    return { fobKgBase: "indeterminado", avisos: [] };
  }

  if (bruto <= 0 && liq <= 0) {
    return { fobKgBase: "indeterminado", avisos: ["Peso ausente na linha."] };
  }

  if (bruto > 0 && liq > 0 && bruto === liq) {
    return { fobKgBase: "indeterminado", avisos: [] };
  }

  const ref = fobKgReferencia != null && fobKgReferencia > 0 ? fobKgReferencia : null;

  if (ref && bruto > 0 && liq > 0) {
    const errBruto = relErr(fobTotalUS, ref * bruto);
    const errLiquido = relErr(fobTotalUS, ref * liq);

    if (errBruto > TOLERANCIA_RECONCILIACAO_FOB && errLiquido > TOLERANCIA_RECONCILIACAO_FOB) {
      return { fobKgBase: "indeterminado", avisos: [AVISO_RECONCILIACAO] };
    }

    if (Math.abs(errBruto - errLiquido) < 1e-12) {
      return { fobKgBase: "indeterminado", avisos: [] };
    }

    if (errBruto <= TOLERANCIA_RECONCILIACAO_FOB && errBruto <= errLiquido) {
      if (bruto !== liq) avisos.push(AVISO_BRUTO_CIF);
      return { fobKgBase: "bruto", avisos };
    }

    if (errLiquido <= TOLERANCIA_RECONCILIACAO_FOB) {
      return { fobKgBase: "liquido", avisos };
    }

    return { fobKgBase: "indeterminado", avisos: [AVISO_RECONCILIACAO] };
  }

  if (bruto > 0 && liq <= 0) return { fobKgBase: "bruto", avisos: [] };
  if (liq > 0 && bruto <= 0) return { fobKgBase: "liquido", avisos: [] };

  if (bruto > 0 && liq > 0) {
    avisos.push(AVISO_BRUTO_CIF);
    return { fobKgBase: "bruto", avisos };
  }

  return { fobKgBase: "indeterminado", avisos: [] };
}
