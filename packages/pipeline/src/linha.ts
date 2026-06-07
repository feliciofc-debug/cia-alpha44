/** Linha crua do parser / upload (contrato API ↔ frontend). */

export interface LinhaCrua {
  __row?: number;
  descOriginal: string;
  ncm: string | null;
  qtd: number | null;
  unidade?: string | null;
  pesoBrutoKg: number | null;
  pesoLiqKg: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number | null;
  dimensoes?: string | null;
  /** Foto do produto (base64) — extraída da planilha .xlsx. */
  fotoBase64?: string;
  fotoMime?: string;
}

/** Peso líquido por linha (regra 4: bruto × 0,92 se não informado). */
export function resolvePesoLiqLinha(l: LinhaCrua): number {
  if (l.pesoLiqKg !== null && l.pesoLiqKg > 0) return l.pesoLiqKg;
  if (l.pesoBrutoKg !== null && l.pesoBrutoKg > 0) return l.pesoBrutoKg * 0.92;
  return 0;
}
