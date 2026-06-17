import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  type PdfNcmAuditContext,
} from "@cia/shared";

function item(partial: Partial<Item>): Item {
  return {
    descOriginal: partial.descPt ?? "Produto",
    descPt: partial.descPt ?? "Produto",
    descDuimp: partial.descPt ?? "Produto",
    ncm: "87149490",
    ncmValido: true,
    pesoLiqKg: 1,
    fobTotalUS: 1,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
    ...partial,
  } as Item;
}

const ctxSemCatalogo: PdfNcmAuditContext = { catalogExiste: () => false };

describe("auditarItemNcmParaPdf — NCM informado aceito", () => {
  it("whisky/chá com ncmValido false — libera PDF", () => {
    for (const ncm of ["22083020", "09023000"]) {
      const it = item({ ncm, ncmValido: false, compatibilidadeProduto: "revisar" });
      expect(auditarItemNcmParaPdf(it, ctxSemCatalogo).bloqueia).toBe(false);
    }
  });

  it("revisar/incompatível com NCM — não bloqueia", () => {
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "revisar" }), ctxSemCatalogo).bloqueia).toBe(false);
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "incompativel" }), ctxSemCatalogo).bloqueia).toBe(false);
  });

  it("NCM vazio bloqueia", () => {
    expect(auditarItemNcmParaPdf(item({ ncm: "" }), ctxSemCatalogo).bloqueia).toBe(true);
    expect(itemPrecisaResolucaoNcm(item({ ncm: "" }), ctxSemCatalogo)).toBe(true);
  });

  it("fora catálogo com NCM — libera", () => {
    const it = item({ ncm: "99998877", compatibilidadeProduto: "compativel" });
    expect(itemBloqueiaPdfNcm(it, ctxSemCatalogo)).toBe(false);
  });
});
