import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import { auditarNcmsParaPdf, NcmInvalidoPdfError } from "../src/services/validar-ncm-pdf.js";

const catalog = criarNcmCatalog(loadNcmVigente());

function item(partial: Partial<Item> & Pick<Item, "descPt">): Item {
  return {
    descOriginal: partial.descPt,
    descDuimp: partial.descPt,
    qtd: 1,
    pesoLiqKg: 1,
    fobTotalUS: 10,
    ncm: "94052100",
    ncmValido: true,
    ...partial,
  } as Item;
}

describe("auditarNcmsParaPdf", () => {
  it("passa quando todos os NCMs são válidos", () => {
    expect(() =>
      auditarNcmsParaPdf(
        [item({ descPt: "Lustre de teto LED", ncm: "94052100", ncmValido: true })],
        catalog,
      ),
    ).not.toThrow();
  });

  it("bloqueia NCM marcado inválido ou incoerente", () => {
    expect(() =>
      auditarNcmsParaPdf(
        [
          item({
            descPt: "Lustre pendente",
            ncm: "21069010",
            ncmValido: false,
            ncmAvisos: ["NCM incoerente com iluminação."],
          }),
        ],
        catalog,
      ),
    ).toThrow(NcmInvalidoPdfError);
  });

  it("bloqueia NCM pendente ou ausente no catálogo", () => {
    try {
      auditarNcmsParaPdf([item({ descPt: "Produto X", ncm: "", ncmValido: false })], catalog);
      expect.fail("deveria lançar");
    } catch (e) {
      expect(e).toBeInstanceOf(NcmInvalidoPdfError);
      expect((e as NcmInvalidoPdfError).itens).toHaveLength(1);
      expect((e as NcmInvalidoPdfError).codigo).toBe("NCM_INVALIDO");
    }
  });
});
