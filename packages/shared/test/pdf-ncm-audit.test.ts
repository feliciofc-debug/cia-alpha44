import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPodeConfirmarNcmIndividual,
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

describe("auditarItemNcmParaPdf — gate unificado", () => {
  it("azeite em vidro — front e back liberam (sem confirmação)", () => {
    const azeite = item({
      descPt: "Azeite de oliva extravirgem, em embalagem de vidro de 1 litro",
      ncm: "15092000",
      compatibilidadeProduto: "compativel",
      pdfNcmAudit: { bloqueia: false, precisaConfirmacao: false },
    });
    expect(itemBloqueiaPdfNcm(azeite)).toBe(false);
    expect(itemPrecisaResolucaoNcm(azeite)).toBe(false);
    expect(auditarItemNcmParaPdf(azeite, ctxOk).bloqueia).toBe(false);
  });

  it("compatível + validar ok → libera sem confirmação", () => {
    const ok = item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.97 });
    const audit = auditarItemNcmParaPdf(ok, ctxOk);
    expect(audit).toEqual({ bloqueia: false, precisaConfirmacao: false });
    expect(itemBloqueiaPdfNcm(ok, ctxOk)).toBe(false);
    expect(itemPrecisaResolucaoNcm(ok, ctxOk)).toBe(false);
  });

  it("baixa confiança não bloqueia PDF (revisão opcional)", () => {
    const baixa = item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.55 });
    expect(itemBloqueiaPdfNcm(baixa, ctxOk)).toBe(false);
    expect(itemPrecisaResolucaoNcm(baixa, ctxOk)).toBe(true);
  });

  it("confirmacaoNcmVigente libera mesmo com validar falho", () => {
    const confirmado = {
      ...item({
        descPt: "Azeite de oliva extravirgem",
        ncm: "15092000",
        compatibilidadeProduto: "compativel",
      }),
      ...metaConfirmacaoNcm("15092000"),
    };
    expect(auditarItemNcmParaPdf(confirmado, ctxValidarFalha).bloqueia).toBe(false);
  });

  it("revisar, incompatível e NCM vazio bloqueiam", () => {
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "revisar" }), ctxOk).bloqueia).toBe(true);
    expect(auditarItemNcmParaPdf(item({ compatibilidadeProduto: "incompativel" }), ctxOk).bloqueia).toBe(true);
    expect(auditarItemNcmParaPdf(item({ ncm: "" }), ctxOk).bloqueia).toBe(true);
  });

  it("usa pdfNcmAudit embutido quando ctx ausente", () => {
    const embutido = item({
      pdfNcmAudit: { bloqueia: true, precisaConfirmacao: true, motivo: "teste" },
      compatibilidadeProduto: "compativel",
    });
    expect(auditarItemNcmParaPdf(embutido).bloqueia).toBe(true);
  });
});
