/** Ingestão unificada: Excel, CSV, PDF e imagem → linhas para cotação. */

import { parseSupplierFile, parseSupplierOcrText, type ParsedSupplierFile } from "@cia/pipeline";
import type { OcrProvider } from "../ocr/types.js";

const EXT_PLANILHA = /\.(xlsx|xls|csv)$/i;
const EXT_OCR = /\.(pdf|png|jpe?g|webp|tiff?|bmp)$/i;

export type FonteIngestao = "planilha" | "ocr";

export interface IngestResult extends ParsedSupplierFile {
  arquivo: string;
  fonte: FonteIngestao;
  ocrPaginas?: number;
}

export function tipoIngestao(filename: string): FonteIngestao | null {
  const f = filename.toLowerCase();
  if (EXT_PLANILHA.test(f)) return "planilha";
  if (EXT_OCR.test(f)) return "ocr";
  return null;
}

export async function ingerirArquivo(
  filename: string,
  bytes: Uint8Array,
  ocr: OcrProvider,
): Promise<IngestResult> {
  const fonte = tipoIngestao(filename);
  if (!fonte) {
    throw new Error("Formato não suportado. Use .xlsx, .csv, .pdf ou imagem (.png, .jpg).");
  }

  if (fonte === "planilha") {
    const parsed = parseSupplierFile(bytes);
    return { arquivo: filename, fonte, ...parsed };
  }

  if (!ocr.disponivel) {
    throw new Error("OCR não configurado — defina OCR_API_KEY na VPS (ver docs/OCR.md).");
  }

  const ocrOut = await ocr.extrair(bytes, filename);
  const parsed = parseSupplierOcrText(ocrOut.texto, filename);
  return {
    arquivo: filename,
    fonte,
    ocrPaginas: ocrOut.paginas,
    ...parsed,
    avisos: [...ocrOut.avisos, ...parsed.avisos],
  };
}
