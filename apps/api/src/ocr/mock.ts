import type { OcrProvider, OcrResult } from "./types.js";

/** OCR de demonstração — não lê o arquivo; útil sem chave configurada. */
export function criarMockOcrProvider(): OcrProvider {
  return {
    nome: "mock (sem OCR)",
    disponivel: false,
    async extrair(): Promise<OcrResult> {
      throw new Error("OCR não configurado — defina OCR_API_KEY no servidor.");
    },
  };
}
