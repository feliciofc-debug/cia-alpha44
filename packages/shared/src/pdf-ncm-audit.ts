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
  validarNcm: (ncm8: string, desc: string, fonte: string) => { ok: boolean; avisos?: string[] };
}

function descricaoItem(it: Item): string {
  return (it.descPt || it.descOriginal || "").trim();
}

/** Predicado único para gate PDF — mesma política no front e no back. */
export function auditarItemNcmParaPdf(it: Item, ctx?: PdfNcmAuditContext): PdfNcmAuditResult {
  // 1. override humano vence
  if (confirmacaoNcmVigente(it)) {
    return { bloqueia: false, precisaConfirmacao: false };
  }

  const desc = descricaoItem(it);
  const key = ncm8Limpo(it.ncm ?? "");

  // 2. NCM vazio / 00000000
  if (!key || key === "00000000") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "NCM pendente ou inválido",
    };
  }

  // 3. incompatível
  if (it.compatibilidadeProduto === "incompativel") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: it.motivoCompatibilidade?.trim() || "NCM × produto incompatível",
    };
  }

  // 6. revisar (antes de catálogo — independe de validarNcmItem)
  if (it.compatibilidadeProduto === "revisar") {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: it.motivoCompatibilidade?.trim() || "Revisar compatibilidade do NCM",
    };
  }

  // Regras 4–5 exigem catálogo + validarNcmItem (back e front com ctx).
  if (!ctx) {
    if (it.pdfNcmAudit) return it.pdfNcmAudit;
    return { bloqueia: false, precisaConfirmacao: false };
  }

  // 4. ausente na Siscomex
  if (!ctx.catalogExiste(key)) {
    return {
      bloqueia: true,
      precisaConfirmacao: true,
      motivo: "NCM ausente na tabela vigente Siscomex.",
    };
  }

  // 5. validarNcmItem
  if (desc) {
    const v = ctx.validarNcm(key, desc, it.ncmFonte ?? "ia");
    if (!v.ok) {
      const avisos = v.avisos?.length ? [...v.avisos] : ["NCM incoerente com o produto."];
      return {
        bloqueia: true,
        precisaConfirmacao: true,
        motivo: avisos[0],
        avisos,
      };
    }
  }

  // 7. compatível + existe + validar ok → libera
  return { bloqueia: false, precisaConfirmacao: false };
}

export function enriquecerItemPdfNcmAudit(it: Item, ctx: PdfNcmAuditContext): Item {
  return { ...it, pdfNcmAudit: auditarItemNcmParaPdf(it, ctx) };
}

export function enriquecerItensPdfNcmAudit(itens: Item[], ctx: PdfNcmAuditContext): Item[] {
  return itens.map((it) => enriquecerItemPdfNcmAudit(it, ctx));
}
