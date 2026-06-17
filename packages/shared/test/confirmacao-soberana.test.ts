import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  confirmacaoNcmVigente,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  metaConfirmacaoNcm,
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

const ctxSemNcm: PdfNcmAuditContext = {
  catalogExiste: () => false,
};

describe("confirmação humana soberana — invariante global", () => {
  const casosConfirmados: Item[] = [
    mk({
      descPt: "Whisky Single Malt 700ml",
      ncm: "22083020",
      ncmValido: false,
      compatibilidadeProduto: "revisar",
      ...metaConfirmacaoNcm("22083020", "analista@test"),
    }),
    mk({
      descPt: "Chá preto folhas soltas",
      ncm: "09023000",
      ncmValido: false,
      compatibilidadeProduto: "revisar",
      ...metaConfirmacaoNcm("0902.30.00", "analista@test"),
    }),
    mk({
      descPt: "Incompatível confirmado",
      ncm: "72085200",
      compatibilidadeProduto: "incompativel",
      ...metaConfirmacaoNcm("72085200"),
    }),
    mk({
      descPt: "Fora do catálogo CIA",
      ncm: "99998877",
      ncmValido: false,
      compatibilidadeProduto: "revisar",
      ...metaConfirmacaoNcm("99998877"),
    }),
  ];

  for (const itemCase of casosConfirmados) {
    it(`confirmado ⇒ não bloqueia: ${itemCase.descPt}`, () => {
      expect(confirmacaoNcmVigente(itemCase)).toBe(true);
      expect(auditarItemNcmParaPdf(itemCase, ctxSemNcm).bloqueia).toBe(false);
      expect(itemBloqueiaPdfNcm(itemCase, ctxSemNcm)).toBe(false);
      expect(itemPrecisaResolucaoNcm(itemCase, ctxSemNcm)).toBe(false);
    });
  }

  it("ncm8 normalizado — 2208.30.20 confirmação casa com coluna", () => {
    const itemCase = mk({
      ncm: "2208.30.20",
      ...metaConfirmacaoNcm("22083020"),
    });
    expect(confirmacaoNcmVigente(itemCase)).toBe(true);
  });

  it("sem confirmação + fora catálogo continua bloqueando", () => {
    const itemCase = mk({ ncm: "99998877", compatibilidadeProduto: "compativel" });
    expect(auditarItemNcmParaPdf(itemCase, ctxSemNcm).bloqueia).toBe(true);
  });

  it("confirmado fora catálogo — aviso suave, não bloqueia", () => {
    const itemCase = mk({
      ncm: "99998877",
      ...metaConfirmacaoNcm("99998877"),
    });
    const audit = auditarItemNcmParaPdf(itemCase, ctxSemNcm);
    expect(audit.bloqueia).toBe(false);
    expect(audit.avisos?.[0]).toMatch(/fora da base CIA/i);
  });
});
