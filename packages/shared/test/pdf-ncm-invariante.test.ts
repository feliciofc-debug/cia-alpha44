import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  type PdfNcmAuditContext,
} from "@cia/shared";

function mk(partial: Partial<Item>): Item {
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

const ctxIncoerente: PdfNcmAuditContext = {
  catalogExiste: () => true,
  validarNcm: () => ({ ok: false, avisos: ["NCM incoerente com o produto."] }),
};

const ctxAusente: PdfNcmAuditContext = {
  catalogExiste: (k) => k !== "99999999",
};

describe("invariante PDF NCM — juiz único (compatibilidadeProduto)", () => {
  const lote: Item[] = [
    mk({ descPt: "Compatível ok", compatibilidadeProduto: "compativel", ncmConfianca: 0.95 }),
    mk({ descPt: "Revisar", compatibilidadeProduto: "revisar" }),
    mk({ descPt: "Incompatível", compatibilidadeProduto: "incompativel" }),
    mk({ descPt: "NCM vazio", ncm: "", compatibilidadeProduto: "compativel" }),
    mk({ descPt: "NCM pendente fonte", ncm: "95030097", ncmFonte: "pendente", compatibilidadeProduto: "compativel" }),
    mk({
      descPt: "Carrinho brinquedo",
      ncm: "95030097",
      compatibilidadeProduto: "compativel",
      pdfNcmAudit: { bloqueia: true, precisaConfirmacao: true, motivo: "legado incoerente" },
    }),
    mk({
      descPt: "Trena 5m",
      ncm: "84659110",
      compatibilidadeProduto: "compativel",
      pdfNcmAudit: { bloqueia: true, precisaConfirmacao: true, motivo: "legado incoerente" },
    }),
    mk({ descPt: "Chave de fenda", ncm: "82054000", compatibilidadeProduto: "compativel" }),
    mk({ descPt: "Camiseta", ncm: "61091000", compatibilidadeProduto: "compativel" }),
    mk({ descPt: "Baixa conf", compatibilidadeProduto: "compativel", ncmConfianca: 0.55 }),
    mk({ descPt: "NCM inexistente", ncm: "99999999", compatibilidadeProduto: "compativel" }),
  ];

  for (const itemCase of lote) {
    it(`compatível nunca bloqueia (sem ctx): ${itemCase.descPt}`, () => {
      if (itemCase.compatibilidadeProduto === "compativel" && itemCase.ncmFonte !== "pendente") {
        const key = (itemCase.ncm ?? "").replace(/\D/g, "");
        if (key && key !== "00000000") {
          expect(itemBloqueiaPdfNcm(itemCase)).toBe(false);
          expect(auditarItemNcmParaPdf(itemCase).bloqueia).toBe(false);
        }
      }
    });
  }

  for (const itemCase of lote) {
    it(`bloqueia ⇒ barra (sem ctx): ${itemCase.descPt}`, () => {
      if (itemBloqueiaPdfNcm(itemCase)) {
        expect(itemPrecisaResolucaoNcm(itemCase)).toBe(true);
      }
    });
  }

  for (const itemCase of lote) {
    it(`bloqueia ⇒ barra (ctx incoerente): ${itemCase.descPt}`, () => {
      if (itemBloqueiaPdfNcm(itemCase, ctxIncoerente)) {
        expect(itemPrecisaResolucaoNcm(itemCase, ctxIncoerente)).toBe(true);
      }
    });
  }

  it("validarNcm falho não veta compatível com catálogo", () => {
    const carrinho = mk({
      descPt: "Carrinho de controle remoto (brinquedo)",
      ncm: "95030097",
      compatibilidadeProduto: "compativel",
    });
    expect(auditarItemNcmParaPdf(carrinho, ctxIncoerente).bloqueia).toBe(false);
    expect(itemBloqueiaPdfNcm(carrinho, ctxIncoerente)).toBe(false);
  });

  it("pdfNcmAudit legado não bloqueia compatível", () => {
    const carrinho = lote.find((i) => i.descPt?.includes("Carrinho"))!;
    expect(auditarItemNcmParaPdf(carrinho).bloqueia).toBe(false);
    expect(itemPrecisaResolucaoNcm(carrinho)).toBe(false);
  });

  it("NCM ausente na Siscomex bloqueia compatível", () => {
    const x = mk({ descPt: "X", ncm: "99999999", compatibilidadeProduto: "compativel" });
    expect(auditarItemNcmParaPdf(x, ctxAusente).bloqueia).toBe(true);
    expect(itemPrecisaResolucaoNcm(x, ctxAusente)).toBe(true);
  });
});
