/**
 * OCR.space — https://ocr.space/ocrapi
 * Crie a API key em: https://ocr.space/ocrapi/freekey.aspx
 * Variável: OCR_API_KEY
 */

import type { OcrProvider, OcrResult } from "./types.js";

const ENDPOINT = "https://api.ocr.space/parse/image";

interface OcrSpaceParsed {
  ParsedText?: string;
  FileParseExitCode?: number;
  ErrorMessage?: string;
}

interface OcrSpaceResponse {
  OCRExitCode?: number;
  IsErroredOnProcessing?: boolean;
  ErrorMessage?: string | string[];
  ParsedResults?: OcrSpaceParsed[] | null;
}

export function criarOcrSpaceProvider(apiKey: string, language = process.env.OCR_LANGUAGE ?? "auto"): OcrProvider {
  return {
    nome: "ocr.space",
    disponivel: Boolean(apiKey),
    async extrair(bytes: Uint8Array, filename: string): Promise<OcrResult> {
      const form = new FormData();
      form.append("apikey", apiKey);
      form.append("language", language);
      form.append("isOverlayRequired", "false");
      form.append("detectOrientation", "true");
      form.append("scale", "true");
      form.append("OCREngine", "2");
      form.append("isTable", "true");
      form.append(
        "file",
        new Blob([bytes], { type: mimePorExtensao(filename) }),
        filename,
      );

      const res = await fetch(ENDPOINT, { method: "POST", body: form });
      if (!res.ok) throw new Error(`OCR.space HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as OcrSpaceResponse;
      if (data.IsErroredOnProcessing) {
        const msg = Array.isArray(data.ErrorMessage) ? data.ErrorMessage.join("; ") : data.ErrorMessage;
        throw new Error(msg || "OCR.space falhou ao processar o arquivo.");
      }

      const partes = data.ParsedResults ?? [];
      const textos = partes
        .map((p) => (p.ParsedText ?? "").trim())
        .filter(Boolean);

      if (textos.length === 0) {
        throw new Error("OCR não extraiu texto — verifique qualidade do PDF/imagem.");
      }

      const avisos: string[] = [];
      for (const p of partes) {
        if (p.ErrorMessage) avisos.push(p.ErrorMessage);
      }

      return {
        texto: textos.join("\n\n"),
        paginas: textos.length,
        confianca: null,
        avisos,
      };
    },
  };
}

function mimePorExtensao(filename: string): string {
  const f = filename.toLowerCase();
  if (f.endsWith(".pdf")) return "application/pdf";
  if (f.endsWith(".png")) return "image/png";
  if (f.endsWith(".jpg") || f.endsWith(".jpeg")) return "image/jpeg";
  if (f.endsWith(".webp")) return "image/webp";
  if (f.endsWith(".tif") || f.endsWith(".tiff")) return "image/tiff";
  return "application/octet-stream";
}
