/** Auditoria informativa de NCM para PDF — não bloqueia geração. */

import type { Item } from "@cia/shared";
import { auditarItemNcmParaPdf, confirmacaoNcmVigente } from "@cia/shared";
import { criarPdfNcmAuditCtx, type NcmCatalog } from "@cia/pipeline";

export interface ItemNcmInvalidoPdf {
  ordem: number;
  descricao: string;
  ncm: string;
  avisos: string[];
}

export class NcmInvalidoPdfError extends Error {
  readonly codigo = "NCM_INVALIDO" as const;
  readonly itens: ItemNcmInvalidoPdf[];

  constructor(itens: ItemNcmInvalidoPdf[]) {
    super(
      `PDF bloqueado: ${itens.length} item(ns) com NCM inválido ou incoerente. Corrija a classificação antes de gerar o orçamento.`,
    );
    this.name = "NcmInvalidoPdfError";
    this.itens = itens;
  }
}

/** Audita itens antes de gerar PDF. Pendências de NCM são informativas e não bloqueiam. */
export function auditarNcmsParaPdf(itens: Item[], catalog: NcmCatalog): void {
  const ctx = criarPdfNcmAuditCtx(catalog);
  const invalidos: ItemNcmInvalidoPdf[] = [];

  for (const it of itens) {
    if (confirmacaoNcmVigente(it)) continue;

    const audit = auditarItemNcmParaPdf(it, ctx);
    if (!audit.bloqueia) continue;

    const desc = (it.descPt || it.descOriginal || "").trim();
    const ncm = (it.ncm ?? "").trim();
    const ordem = it.ordem ?? invalidos.length + 1;
    const avisos = [...(it.ncmAvisos ?? [])];
    if (audit.motivo && !avisos.includes(audit.motivo)) avisos.unshift(audit.motivo);
    for (const a of audit.avisos ?? []) {
      if (!avisos.includes(a)) avisos.push(a);
    }

    invalidos.push({
      ordem,
      descricao: desc.slice(0, 100) || `Item ${ordem}`,
      ncm: ncm || "(pendente)",
      avisos: avisos.length ? avisos : ["NCM pendente de revisão."],
    });
  }

  if (invalidos.length) {
    console.info("[pdf:ncm-informativo]", JSON.stringify({ pendencias: invalidos.length }));
  }
}
