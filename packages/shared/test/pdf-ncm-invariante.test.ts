import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  ncmInformadoParaFechamento,
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

const ctxVazio: PdfNcmAuditContext = { catalogExiste: () => false };

describe("gate PDF — NCM informado aceito (estrutural)", () => {
  const lote: Item[] = [
    mk({ descPt: "Whisky", ncm: "22083020", ncmValido: false, compatibilidadeProduto: "revisar" }),
    mk({ descPt: "Chá", ncm: "09023000", ncmValido: false, compatibilidadeProduto: "incompativel" }),
    mk({ descPt: "Carrinho", ncm: "95030097", compatibilidadeProduto: "compativel", ncmFonte: "ia" }),
    mk({ descPt: "Fora catálogo", ncm: "99998877", compatibilidadeProduto: "revisar" }),
    mk({ descPt: "ncmFonte pendente com dígitos", ncm: "95030097", ncmFonte: "pendente" }),
    mk({ descPt: "Baixa conf", ncm: "87149490", ncmConfianca: 0.4 }),
    mk({ descPt: "NCM vazio", ncm: "" }),
    mk({ descPt: "00000000", ncm: "00000000" }),
  ];

  for (const itemCase of lote) {
    it(`fechamento: ${itemCase.descPt}`, () => {
      const informado = ncmInformadoParaFechamento(itemCase);
      const bloqueia = itemBloqueiaPdfNcm(itemCase, ctxVazio);
      if (informado) {
        expect(bloqueia).toBe(false);
        expect(itemPrecisaResolucaoNcm(itemCase, ctxVazio)).toBe(false);
        expect(auditarItemNcmParaPdf(itemCase, ctxVazio).bloqueia).toBe(false);
      } else {
        expect(bloqueia).toBe(true);
        expect(itemPrecisaResolucaoNcm(itemCase, ctxVazio)).toBe(true);
      }
    });
  }
});
