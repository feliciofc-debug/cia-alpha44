import type { Item } from "./schemas.js";
import { confirmacaoNcmVigente } from "./ncm-confirmacao.js";
import { LIMIAR_CONFIANCA_NCM, ncm8Limpo } from "./ncm-utils.js";
import {
  auditarItemNcmParaPdf,
  ncmInformadoParaFechamento,
  type PdfNcmAuditContext,
} from "./pdf-ncm-audit.js";

export { LIMIAR_CONFIANCA_NCM, ncm8Limpo } from "./ncm-utils.js";
export {
  auditarItemNcmParaPdf,
  enriquecerItemPdfNcmAudit,
  enriquecerItensPdfNcmAudit,
  mesclarItensInvalidosPdfAudit,
  ncmInformadoParaFechamento,
  normalizarAceiteNcmInformado,
  type PdfNcmAuditContext,
  type PdfNcmAuditResult,
} from "./pdf-ncm-audit.js";

/** Item nunca impede PDF; NCM ausente é pendência informativa. */
export function itemBloqueiaPdfNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  return auditarItemNcmParaPdf(it, ctx).bloqueia;
}

/** Revisão opcional (informativo) — não entra na barra de bloqueio PDF. */
export function itemRevisaoOpcionalNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  if (confirmacaoNcmVigente(it) || ncmInformadoParaFechamento(it)) return false;
  if (itemBloqueiaPdfNcm(it, ctx)) return false;
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return true;
  return false;
}

export function itemPodeConfirmarNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  return itemPodeConfirmarNcmIndividual(it, ctx);
}

export function itemPodeConfirmarNcmIndividual(it: Item, _ctx?: PdfNcmAuditContext): boolean {
  if (!ncmInformadoParaFechamento(it)) return false;
  if (confirmacaoNcmVigente(it)) return false;
  if (it.ncmFonte === "gemini" || it.ncmFonte === "ia") return true;
  if (it.ncmEmbarqueStatus === "sem-ncm-coluna") return true;
  if (it.compatibilidadeProduto === "revisar" || it.compatibilidadeProduto === "incompativel") {
    return true;
  }
  if (it.ncmConfianca != null && it.ncmConfianca < LIMIAR_CONFIANCA_NCM) return true;
  return false;
}

export function itensPendentesConfirmacaoNcm(itens: Item[], ctx?: PdfNcmAuditContext): Item[] {
  return itens.filter((it) => itemPodeConfirmarNcmIndividual(it, ctx));
}

/** Barra de resolução — itens SEM NCM informado aparecem para revisão, sem bloquear PDF. */
export function itemPrecisaResolucaoNcm(it: Item, ctx?: PdfNcmAuditContext): boolean {
  return !ncmInformadoParaFechamento(it) || itemBloqueiaPdfNcm(it, ctx);
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
