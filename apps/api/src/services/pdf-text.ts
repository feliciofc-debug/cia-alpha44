/** Extrai texto de PDF nativo (não escaneado) — evita OCR externo quando possível. */

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

export async function extrairTextoPdf(bytes: Uint8Array): Promise<string | null> {
  try {
    // pdf-parse é CJS; import dinâmico via createRequire.
    const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text?: string }>;
    const out = await pdfParse(Buffer.from(bytes));
    const text = (out.text ?? "").trim();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}
