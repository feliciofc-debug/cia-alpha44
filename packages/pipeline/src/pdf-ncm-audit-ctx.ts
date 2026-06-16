import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  enriquecerItensPdfNcmAudit,
  type PdfNcmAuditContext,
  type PdfNcmAuditResult,
} from "@cia/shared";
import { validarNcmItem } from "./classificar-ncm.js";
import type { NcmCatalog } from "./ncm-catalog.js";
import type { NcmFonte } from "./resolve-ncm.js";

export function criarPdfNcmAuditCtx(catalog: NcmCatalog): PdfNcmAuditContext {
  return {
    catalogExiste: (ncm8) => catalog.existe(ncm8),
    validarNcm: (ncm8, desc, fonte) => {
      const v = validarNcmItem(ncm8, desc, catalog, fonte as NcmFonte);
      return { ok: v.ok, avisos: v.avisos };
    },
  };
}

export function auditarItemNcmParaPdfComCatalog(it: Item, catalog: NcmCatalog): PdfNcmAuditResult {
  return auditarItemNcmParaPdf(it, criarPdfNcmAuditCtx(catalog));
}

export { enriquecerItensPdfNcmAudit };
