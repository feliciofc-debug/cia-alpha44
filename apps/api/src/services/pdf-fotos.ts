/** Redimensiona fotos para PDF — fiel ao preview, sem travar o PDFKit. */

import sharp from "sharp";
import type { Item } from "@cia/shared";
import { lerFotoItem } from "./fotos.js";

export async function prepararFotoParaPdf(buffer: Buffer): Promise<Buffer | null> {
  if (buffer.length === 0) return null;
  try {
    return await sharp(buffer, { failOn: "none" })
      .rotate()
      .resize(480, 480, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
}

async function bufferBrutoItem(it: Item): Promise<Buffer | null> {
  if (it.fotoBase64) {
    try {
      return Buffer.from(it.fotoBase64, "base64");
    } catch {
      /* continua */
    }
  }
  if (it.fotoPath) {
    const f = await lerFotoItem(it.fotoPath);
    return f?.buffer ?? null;
  }
  return null;
}

/** Até 6 fotos — uma por item, na ordem da planilha (igual ao preview web). */
export async function fotosParaPdf(itens: Item[]): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const it of itens) {
    const raw = await bufferBrutoItem(it);
    if (!raw) continue;
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
