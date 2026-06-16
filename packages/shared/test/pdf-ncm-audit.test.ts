import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  metaConfirmacaoNcm,
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

const ctxValidarFalha: PdfNcmAuditContext = {
  catalogExiste: () => true,
  validarNcm: () => ({
    ok: false,
    avisos: ["NCM incoerente com o produto (embalagem_papel, prefixos 4819/3923)."],
  }),
};

const ctxOk: PdfNcmAuditContext = {
  catalogExiste: () => true,
  validarNcm: () => ({ ok: true }),
};

describe("auditarItemNcmParaPdf — juiz único (compatibilidadeProduto)", () => {
  it("azeite compatível — libera mesmo se validarNcm falhasse", () => {
    const azeite = item({
      descPt: "Azeite de oliva extravirgem, em embalagem de vidro de 1 litro",
      ncm: "15092000",
      compatibilidadeProduto: "compativel",
    });
    expect(auditarItemNcmParaPdf(azeite, ctxValidarFalha).bloqueia).toBe(false);
    expect(itemBloqueiaPdfNcm(azeite, ctxValidarFalha)).toBe(false);
    expect(itemPrecisaResolucaoNcm(azeite, ctxValidarFalha)).toBe(false);
  });

  it("compatível + catálogo ok → libera (validarNcm ignorado no gate)", () => {
    const ok = item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.97 });
    const audit = auditarItemNcmParaPdf(ok, ctxValidarFalha);
    expect(audit).toEqual({ bloqueia: false, precisaConfirmacao: false });
  });

  it("baixa confiança compatível não bloqueia PDF", () => {
    const baixa = item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.55 });
    expect(itemBloqueiaPdfNcm(baixa, ctxOk)).toBe(false);
    expect(itemPrecisaResolucaoNcm(baixa, ctxOk)).toBe(true);
  });

  it("confirmacaoNcmVigente libera revisar/incompatível confirmado", () => {
    const confirmado = {
      ...item({ compatibilidadeProduto: "revisar" }),
      ...metaConfirmacaoNcm("87149490"),
    };
    expect(auditarItemNcmParaPdf(confirmado, ctxValidarFalha).bloqueia).toBe(false);
  });

  it("revisar, incompatível e NCM vazio bloqueiam", () => {
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "revisar" }), ctxOk).bloqueia).toBe(true);
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "incompativel" }), ctxOk).bloqueia).toBe(true);
    expect(auditarItemNcmParaPdf(item({ ncm: "" }), ctxOk).bloqueia).toBe(true);
  });

  it("pdfNcmAudit legado não bloqueia compatível sem ctx", () => {
    const embutido = item({
      pdfNcmAudit: { bloqueia: true, precisaConfirmacao: true, motivo: "legado" },
      compatibilidadeProduto: "compativel",
    });
    expect(auditarItemNcmParaPdf(embutido).bloqueia).toBe(false);
  });
});
