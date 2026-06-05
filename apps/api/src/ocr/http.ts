/**
 * Adapter HTTP genérico — para API OCR própria ou outro provedor.
 * POST multipart no OCR_API_URL com campo "file".
 * Resposta esperada: { "texto": "..." } ou { "text": "..." } ou { "pages": [{ "texto": "..." }] }
 */

import type { OcrProvider, OcrResult } from "./types.js";

export function criarHttpOcrProvider(
  url: string,
  apiKey?: string,
  headerName = process.env.OCR_API_HEADER ?? "Authorization",
): OcrProvider {
  return {
    nome: `http:${new URL(url).hostname}`,
    disponivel: true,
    async extrair(bytes: Uint8Array, filename: string, mimeType?: string): Promise<OcrResult> {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mimeType ?? "application/octet-stream" }), filename);

      const headers: Record<string, string> = {};
      if (apiKey) {
        headers[headerName] = headerName.toLowerCase() === "authorization" ? `Bearer ${apiKey}` : apiKey;
      }

      const res = await fetch(url, { method: "POST", headers, body: form });
      if (!res.ok) throw new Error(`OCR HTTP ${res.status}: ${await res.text()}`);

      const data = (await res.json()) as Record<string, unknown>;
      const texto = extrairTextoResposta(data);
      if (!texto.trim()) throw new Error("OCR HTTP retornou texto vazio.");

      const paginas = Array.isArray(data.pages) ? data.pages.length : 1;
      return { texto, paginas, confianca: null, avisos: [] };
    },
  };
}

function extrairTextoResposta(data: Record<string, unknown>): string {
  if (typeof data.texto === "string") return data.texto;
  if (typeof data.text === "string") return data.text;
  if (Array.isArray(data.pages)) {
    return data.pages
      .map((p) => {
        const pg = p as Record<string, unknown>;
        return String(pg.texto ?? pg.text ?? "");
      })
      .filter(Boolean)
      .join("\n\n");
  }
  throw new Error("Resposta OCR inválida — esperado { texto } ou { pages }.");
}
