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
  /** @deprecated Não usado no gate PDF. */
  validarNcm?: (ncm8: string, desc: string, fonte: string) => { ok: boolean; avisos?: string[] };
}

/** NCM de 8 dígitos informado (planilha, IA ou analista). */
export function ncmInformadoParaFechamento(it: Item): boolean {
  const key = ncm8Limpo(it.ncm ?? "");
  return Boolean(key && key !== "00000000");
}

/** NCM informado ⇒ aceito — normaliza flag de exibição (não revalida catálogo). */
export function normalizarAceiteNcmInformado(it: Item): Item {
  if (!ncmInformadoParaFechamento(it)) return it;
  return { ...it, ncmValido: true };
}

/**
 * Gate de fechamento PDF — regra estrutural única:
 * bloqueia SOMENTE se NCM ausente / 00000000.
 * Classificação (compatível/revisar/validarNcm/catálogo) NÃO veta o PDF.
 */
export function auditarItemNcmParaPdf(it: Item, _ctx?: PdfNcmAuditContext): PdfNcmAuditResult {
  if (confirmacaoNcmVigente(it)) {
    return { bloqueia: false, precisaConfirmacao: false };
  }

  const key = ncm8Limpo(it.ncm ?? "");

  if (!key || key === "00000000") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "NCM pendente — informe o código de 8 dígitos",
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

/** Mescla 422 legado — não sobrescreve item que já tem NCM informado. */
export function mesclarItensInvalidosPdfAudit(
  itens: Item[],
  invalidos: Array<{ ordem: number; avisos?: string[] }>,
): Item[] {
  if (!invalidos.length) return itens;
  const byOrdem = new Map(invalidos.map((inv) => [inv.ordem, inv]));
  return itens.map((it, idx) => {
    const ordem = it.ordem ?? idx + 1;
    const inv = byOrdem.get(ordem);
    if (!inv || ncmInformadoParaFechamento(it)) return it;
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

export { ncm8Limpo } from "./ncm-utils.js";
