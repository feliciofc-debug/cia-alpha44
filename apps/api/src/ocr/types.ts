/** Contrato do provedor OCR — PDF/imagem → texto para o parser. */

export interface OcrResult {
  texto: string;
  paginas: number;
  confianca?: number | null;
  avisos: string[];
}

export interface OcrProvider {
  nome: string;
  disponivel: boolean;
  extrair(bytes: Uint8Array, filename: string, mimeType?: string): Promise<OcrResult>;
}
