/** Erro estruturado ao falhar geração/download de PDF (422 NCM, timeout, etc.). */

export interface ItemInvalidoPdf {
  ordem: number;
  descricao: string;
  ncm: string;
}

export class PdfDownloadError extends Error {
  readonly codigo?: string;
  readonly itensInvalidos?: ItemInvalidoPdf[];

  constructor(
    message: string,
    opts?: { codigo?: string; itensInvalidos?: ItemInvalidoPdf[] },
  ) {
    super(message);
    this.name = "PdfDownloadError";
    this.codigo = opts?.codigo;
    this.itensInvalidos = opts?.itensInvalidos;
  }

  get contagemPendencias(): number {
    return this.itensInvalidos?.length ?? 0;
  }

  mensagemAcionavel(fallbackCount = 0): string {
    const n = this.contagemPendencias || fallbackCount;
    if (this.codigo === "NCM_INVALIDO" && n > 0) {
      return `PDF bloqueado: ${n} item(ns) com NCM pendente`;
    }
    return this.message;
  }
}

export function asPdfDownloadError(e: unknown): PdfDownloadError {
  if (e instanceof PdfDownloadError) return e;
  const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
  return new PdfDownloadError(msg);
}
