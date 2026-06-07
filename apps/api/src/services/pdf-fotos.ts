/** Redimensiona fotos para PDF — fiel ao preview, sem travar o PDFKit. */

import sharp from "sharp";
import type { Item } from "@cia/shared";

export async function prepararFotoParaPdf(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length === 0) return null;
  try {
    return await sharp(buffer)
      .rotate()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
}

async function bufferBrutoItem(it: Item): Promise<Buffer | null> {
  if (!it.fotoBase64) return null;
  try {
    return Buffer.from(it.fotoBase64, "base64");
  } catch {
    return null;
  }
}

function chaveFoto(buf: Buffer): string {
  return `${buf.length}:${buf.subarray(0, 24).toString("hex")}`;
}

/** Até 6 fotos únicas — mesmo limite do preview web. */
export async function fotosParaPdf(itens: Item[]): Promise<Buffer[]> {
  const seen = new Set<string>();
  const out: Buffer[] = [];
  for (const it of itens) {
    const raw = await bufferBrutoItem(it);
    if (!raw) continue;
    const key = chaveFoto(raw);
    if (seen.has(key)) continue;
    seen.add(key);
    const prepared = await prepararFotoParaPdf(raw);
    if (!prepared) continue;
    out.push(prepared);
    if (out.length >= 6) break;
  }
  return out;
}

/** Primeira foto do item — igual ao preview (MERCADORIAS NCM). */
export async function primeiraFotoParaPdf(itens: Item[]): Promise<Buffer | null> {
  for (const it of itens) {
    const raw = await bufferBrutoItem(it);
    if (!raw) continue;
    const prepared = await prepararFotoParaPdf(raw);
    if (prepared) return prepared;
  }
  return null;
}
