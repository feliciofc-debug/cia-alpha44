/** Linha crua do parser / upload (contrato API ↔ frontend). */

export interface LinhaCrua {
  __row?: number;
  descOriginal: string;
  ncm: string | null;
  qtd: number | null;
  /** Coluna 箱数 — usada com qtdPorCaixa (sem inventar qtd). */
  qtdCaixas?: number | null;
  /** Coluna 装箱量 / qtd por caixa. */
  qtdPorCaixa?: number | null;
  unidade?: string | null;
  pesoBrutoKg: number | null;
  pesoLiqKg: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number | null;
  dimensoes?: string | null;
  /** Material (材质) — coluna fornecedor. */
  material?: string | null;
  /** Uso / aplicação (用途). */
  uso?: string | null;
  /** Avisos de derivação de qtd (caixa compartilhada). */
  avisosQtd?: string[];
  /** Foto do produto (base64) — extraída da planilha .xlsx. */
  fotoBase64?: string;
  fotoMime?: string;
}

export interface PesoLinha {
  pesoLiqKg: number | null;
  pesoBrutoKg: number | null;
}

/** Peso líquido real da planilha (exibição / export / PDF). */
export function pesoLiqReal(l: PesoLinha): number {
  if (l.pesoLiqKg != null && l.pesoLiqKg > 0) return l.pesoLiqKg;
  if (l.pesoBrutoKg != null && l.pesoBrutoKg > 0) return l.pesoBrutoKg * 0.92;
  return 0;
}

/** Peso bruto real da planilha (exibição / export / PDF). */
export function pesoBrutoReal(l: PesoLinha): number | null {
  if (l.pesoBrutoKg != null && l.pesoBrutoKg > 0) return l.pesoBrutoKg;
  return null;
}

/**
 * Peso para rateio fiscal/frete (motor 66).
 * Planilhas chinesas (装箱单): quando há líq e bruto, Comex Plus rateia pelo bruto.
 */
export function resolvePesoLiqLinha(l: PesoLinha): number {
  if (l.pesoBrutoKg != null && l.pesoBrutoKg > 0 && l.pesoLiqKg != null && l.pesoLiqKg > 0) {
    return l.pesoBrutoKg;
  }
  if (l.pesoLiqKg != null && l.pesoLiqKg > 0) return l.pesoLiqKg;
  if (l.pesoBrutoKg != null && l.pesoBrutoKg > 0) return l.pesoBrutoKg * 0.92;
  return 0;
}

/** Alias explícito — mesmo contrato do motor fiscal (não alterar sem regressão). */
export const resolvePesoLiqRateio = resolvePesoLiqLinha;

export interface TotaisPesoExibicao {
  pesoLiqKg: number;
  pesoBrutoKg: number;
  /** true quando bruto ≠ líq — despachante opera FOB/kg na base bruta. */
  baseDespachanteBruta: boolean;
}

/** Soma pesos reais para PDF / conciliação (nunca colapsa líq em bruto). */
export function totaisPesoExibicao(
  itens: Array<{ pesoLiqKg: number; pesoBrutoKg?: number | null }>,
): TotaisPesoExibicao {
  const pesoLiqKg = itens.reduce((acc, it) => acc + (it.pesoLiqKg > 0 ? it.pesoLiqKg : 0), 0);
  const brutoSum = itens.reduce((acc, it) => acc + (it.pesoBrutoKg ?? 0), 0);
  const pesoBrutoKg = brutoSum > 0 ? brutoSum : pesoLiqKg * 1.1;
  return {
    pesoLiqKg,
    pesoBrutoKg,
    baseDespachanteBruta: brutoSum > 0 && Math.abs(pesoLiqKg - brutoSum) > 0.01,
  };
}

export const AVISO_PDF_BASE_DESPACHANTE_BRUTA =
  "FOB/kg planilha na base bruta (despachante); CIF rateado pelo peso líquido";
