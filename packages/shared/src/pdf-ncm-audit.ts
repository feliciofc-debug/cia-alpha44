import type { Item } from "./schemas.js";
import { confirmacaoNcmVigente } from "./ncm-confirmacao.js";
import { ncm8Limpo } from "./ncm-utils.js";

export interface PdfNcmAuditResult {
  bloqueia: boolean;
  precisaConfirmacao: boolean;
  motivo?: string;
  avisos?: string[];
}

export interface PdfNcmAuditContext {
  catalogExiste: (ncm8: string) => boolean;
  /** @deprecated Não usado no gate PDF — validarNcmItem é insumo da classificação. */
  validarNcm?: (ncm8: string, desc: string, fonte: string) => { ok: boolean; avisos?: string[] };
}

/**
 * Gate único de fechamento PDF — juiz: compatibilidadeProduto (+ NCM presente na Siscomex).
 * validarNcmItem NÃO bloqueia PDF; só alimenta a classificação (compatível/revisar/incompatível).
 */
export function auditarItemNcmParaPdf(it: Item, ctx?: PdfNcmAuditContext): PdfNcmAuditResult {
  if (confirmacaoNcmVigente(it)) {
    return { bloqueia: false, precisaConfirmacao: false };
  }

  const key = ncm8Limpo(it.ncm ?? "");

  if (!key || key === "00000000") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "NCM pendente ou inválido",
    };
  }

  if (it.ncmFonte === "pendente") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "Classificação NCM pendente — informe ou confirme o código",
    };
  }

  if (it.compatibilidadeProduto === "incompativel") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: it.motivoCompatibilidade?.trim() || "NCM × produto incompatível",
    };
  }

  if (it.compatibilidadeProduto === "revisar") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: it.motivoCompatibilidade?.trim() || "Revisar compatibilidade do NCM",
    };
  }

  // compatível — só bloqueia se NCM ausente na Siscomex (quando catálogo disponível)
  if (ctx && !ctx.catalogExiste(key)) {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "NCM ausente na tabela vigente Siscomex.",
    };
  }

  return { bloqueia: false, precisaConfirmacao: false };
}

export function enriquecerItemPdfNcmAudit(it: Item, ctx: PdfNcmAuditContext): Item {
  return { ...it, pdfNcmAudit: auditarItemNcmParaPdf(it, ctx) };
}

export function enriquecerItensPdfNcmAudit(itens: Item[], ctx: PdfNcmAuditContext): Item[] {
  return itens.map((it) => enriquecerItemPdfNcmAudit(it, ctx));
}

/** Aplica audit de bloqueio a partir do 422 PDF (ordem persistida). Respeita juiz único. */
export function mesclarItensInvalidosPdfAudit(
  itens: Item[],
  invalidos: Array<{ ordem: number; avisos?: string[] }>,
): Item[] {
  if (!invalidos.length) return itens;
  const byOrdem = new Map(invalidos.map((inv) => [inv.ordem, inv]));
  return itens.map((it, idx) => {
    const ordem = it.ordem ?? idx + 1;
    const inv = byOrdem.get(ordem);
    if (!inv) return it;
    const audit = auditarItemNcmParaPdf(it);
    if (!audit.bloqueia) return it;
    const avisos = inv.avisos?.length ? [...inv.avisos] : ["NCM pendente de revisão."];
    return {
      ...it,
      pdfNcmAudit: {
        bloqueia: true,
        precisaConfirmacao: true,
        motivo: avisos[0],
        avisos,
      },
    };
  });
}
