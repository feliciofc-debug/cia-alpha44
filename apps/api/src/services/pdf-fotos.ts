/** Fotos seguras para PDF — evita PNGs enormes que travam o PDFKit. */

import type { Item } from "@cia/shared";

/** Acima disso o PDFKit pode bloquear o event loop por minutos. */
export const MAX_FOTO_PDF_BYTES = 400_000;

export function bufferFotoItem(it: Item): Buffer | null {
  if (!it.fotoBase64) return null;
  try {
    const buf = Buffer.from(it.fotoBase64, "base64");
    if (buf.length === 0 || buf.length > MAX_FOTO_PDF_BYTES) return null;
    return buf;
  } catch {
    return null;
  }
}

function chaveFoto(buf: Buffer): string {
  return `${buf.length}:${buf.subarray(0, 24).toString("hex")}`;
}

/** Até 4 fotos únicas, ignorando arquivos grandes ou duplicados. */
export function fotosParaPdf(itens: Item[]): Buffer[] {
  const seen = new Set<string>();
  const out: Buffer[] = [];
  for (const it of itens) {
    const buf = bufferFotoItem(it);
    if (!buf) continue;
    const key = chaveFoto(buf);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(buf);
    if (out.length >= 4) break;
  }
  return out;
}

/** Menor foto válida — ideal para thumbnail em MERCADORIAS NCM. */
export function menorFotoParaPdf(itens: Item[]): Buffer | null {
  let best: Buffer | null = null;
  for (const it of itens) {
    const buf = bufferFotoItem(it);
    if (!buf) continue;
    if (!best || buf.length < best.length) best = buf;
  }
  return best;
}
