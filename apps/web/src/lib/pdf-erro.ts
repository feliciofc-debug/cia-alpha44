/** Erro estruturado ao falhar geração/download de PDF (422 NCM, timeout, etc.). */

import type { PendenciaNcmItem } from "./ncm.ts";

export interface ItemInvalidoPdf {
  ordem: number;
  descricao: string;
  ncm: string;
  avisos?: string[];
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

  mensagemAcionavel(fallbackCount = 0, pendencias?: PendenciaNcmItem[]): string {
    if (pendencias?.length) {
      const visiveis = pendencias.slice(0, 2);
      const restantes = pendencias.length - visiveis.length;
      let msg = `PDF bloqueado: ${visiveis.map((p) => `${p.nome} (${p.motivoCurto})`).join("; ")}`;
      if (restantes > 0) msg += ` +${restantes} → ver todos`;
      return `${msg}. Resolva na aba abaixo.`;
    }

    if (this.codigo === "NCM_INVALIDO" && this.itensInvalidos?.length) {
      const visiveis = this.itensInvalidos.slice(0, 2);
      const restantes = this.itensInvalidos.length - visiveis.length;
      let msg = `PDF bloqueado: ${visiveis.map((i) => `${i.descricao} (NCM pendente)`).join("; ")}`;
      if (restantes > 0) msg += ` +${restantes} → ver todos`;
      return `${msg}. Resolva na aba abaixo.`;
    }

    const n = this.contagemPendencias || fallbackCount;
    if (this.codigo === "NCM_INVALIDO" && n > 0) {
      return `PDF bloqueado: ${n} item(ns) com NCM pendente. Resolva na aba abaixo.`;
    }
    return this.message;
  }
}

export function asPdfDownloadError(e: unknown): PdfDownloadError {
  if (e instanceof PdfDownloadError) return e;
  const msg = e instanceof Error ? e.message : "Falha ao gerar PDF.";
  return new PdfDownloadError(msg);
}
