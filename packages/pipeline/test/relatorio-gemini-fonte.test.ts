import { describe, it, expect } from "vitest";
import { montarLinhasConciliacao } from "../src/relatorio-conciliacao.js";
import type { Item } from "@cia/shared";

function item(partial: Partial<Item>): Item {
  return {
    descOriginal: "Massageador",
    descPt: "Massageador elétrico",
    ncm: "84798999",
    ncmFonte: "gemini",
    ncmConfianca: 0.91,
    compatibilidadeProduto: "compativel",
    pesoLiqKg: 1,
    pesoBrutoKg: 1.2,
    qtd: 1,
    fobTotalUS: 100,
    aliquotas: { ii: 0.14, ipi: 0, pis: 0.0165, cofins: 0.076 },
    ...partial,
  } as Item;
}

describe("montarLinhasConciliacao — fonte Gemini", () => {
  it("exporta NCM operacional Gemini + rótulo validado Siscomex", () => {
    const linhas = montarLinhasConciliacao([item({})]);
    expect(linhas[0]!.ncm).toBe("84798999");
    expect(linhas[0]!.ncmFonte).toBe("Gemini (validado Siscomex)");
  });
});
