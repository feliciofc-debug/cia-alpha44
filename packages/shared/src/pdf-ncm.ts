import type { Item } from "./schemas.js";
import { confirmacaoNcmVigente } from "./ncm-confirmacao.js";
import { LIMIAR_CONFIANCA_NCM, ncm8Limpo } from "./ncm-utils.js";
import {
  auditarItemNcmParaPdf,
  type PdfNcmAuditContext,
} from "./pdf-ncm-audit.js";

export { LIMIAR_CONFIANCA_NCM, ncm8Limpo } from "./ncm-utils.js";
export {
  auditarItemNcmParaPdf,
  enriquecerItemPdfNcmAudit,
  enriquecerItensPdfNcmAudit,
  type PdfNcmAuditContext,
  type PdfNcmAuditResult,
} from "./pdf-ncm-audit.js";

/** Item impede geração do PDF até revisão humana (Confirmar NCM). */
export function itemBloqueiaPdfNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  return auditarItemNcmParaPdf(it, ctx).bloqueia;
}

/** Revisão opcional na barra — confiança baixa não bloqueia PDF. */
export function itemRevisaoOpcionalNcm(it: Item): boolean {
  if (confirmacaoNcmVigente(it)) return false;
  if (itemBloqueiaPdfNcm(it)) return false;
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return false;
  if (it.ncmFonte === "pendente") return true;
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return true;
  return false;
}

/** Item elegível para Confirmar NCM em lote (não inclui incompatível — exige override 1-a-1). */
export function itemPodeConfirmarNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  if (it.compatibilidadeProduto === "incompativel") return false;
  if (confirmacaoNcmVigente(it)) return false;
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return false;
  const audit = auditarItemNcmParaPdf(it, ctx);
  if (audit.bloqueia && audit.precisaConfirmacao) return true;
  return itemRevisaoOpcionalNcm(it);
}

/** Confirmar NCM individual — analista pode forçar qualquer item bloqueado. */
export function itemPodeConfirmarNcmIndividual(it: Item, ctx?: PdfNcmAuditContext): boolean {
  if (confirmacaoNcmVigente(it)) return false;
  const key = ncm8Limpo(it.ncm ?? "");
  if (!key || key === "00000000") return false;
  const audit = auditarItemNcmParaPdf(it, ctx);
  if (audit.bloqueia && audit.precisaConfirmacao) return true;
  return itemPodeConfirmarNcm(it, ctx);
}

export function itensPendentesConfirmacaoNcm(itens: Item[], ctx?: PdfNcmAuditContext): Item[] {
  return itens.filter((it) => itemPodeConfirmarNcm(it, ctx));
}

/** Item exige ação humana na barra de resolução (confirmar e/ou editar NCM). */
export function itemPrecisaResolucaoNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  const audit = auditarItemNcmParaPdf(it, ctx);
  if (audit.bloqueia) return true;
  return itemRevisaoOpcionalNcm(it);
}

export function itensResolucaoNcm(
  itens: Item[],
  ctx?: PdfNcmAuditContext,
): Array<{ idx: number; ordem: number; item: Item }> {
  return itens
    .map((item, idx) => ({ idx, ordem: item.ordem ?? idx, item }))
    .filter(({ item }) => itemPrecisaResolucaoNcm(item, ctx));
}

export function itensBloqueandoPdf(itens: Item[], ctx?: PdfNcmAuditContext): Item[] {
  return itens.filter((it) => itemBloqueiaPdfNcm(it, ctx));
}

export { confirmacaoNcmVigente, validarConfirmacaoNcmItem, validarConfirmacaoNcmItens } from "./ncm-confirmacao.js";
