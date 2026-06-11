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

/** Peso para rateio fiscal/frete — planilhas chinesas (装箱单) trazem total líquido e bruto; Comex Plus rateia pelo bruto. */
export function resolvePesoLiqLinha(l: LinhaCrua): number {
  if (l.pesoBrutoKg !== null && l.pesoBrutoKg > 0 && l.pesoLiqKg !== null && l.pesoLiqKg > 0) {
    return l.pesoBrutoKg;
  }
  if (l.pesoLiqKg !== null && l.pesoLiqKg > 0) return l.pesoLiqKg;
  if (l.pesoBrutoKg !== null && l.pesoBrutoKg > 0) return l.pesoBrutoKg * 0.92;
  return 0;
}
