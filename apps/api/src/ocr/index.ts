/**
 * OCR plugável — traga sua API key (OCR.space ou URL customizada).
 * OCR_PROVIDER = ocrspace | http | mock | auto
 */

import type { OcrProvider } from "./types.js";
import { criarMockOcrProvider } from "./mock.js";
import { criarOcrSpaceProvider } from "./ocrspace.js";
import { criarHttpOcrProvider } from "./http.js";

export * from "./types.js";

export function escolherOcrProvider(): OcrProvider {
  const escolha = (process.env.OCR_PROVIDER ?? "auto").toLowerCase();
  const ocrKey = process.env.OCR_API_KEY?.trim();
  const ocrUrl = process.env.OCR_API_URL?.trim();
  const mock = criarMockOcrProvider();

  if (escolha === "http" && ocrUrl) {
    return criarHttpOcrProvider(ocrUrl, ocrKey);
  }
  if (escolha === "ocrspace" && ocrKey) {
    return criarOcrSpaceProvider(ocrKey);
  }
  if (escolha === "auto") {
    if (ocrUrl) return criarHttpOcrProvider(ocrUrl, ocrKey);
    if (ocrKey) return criarOcrSpaceProvider(ocrKey);
  }
  return mock;
}
