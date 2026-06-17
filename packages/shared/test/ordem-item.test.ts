import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import { divergenciasOrdemItem, idxPorOrdem, itensResolucaoNcm, mesclarOrdemItensPersistidos, ordemDoItem } from "@cia/shared";

function item(partial: Partial<Item> & { ordem?: number }): Item {
  return {
    descOriginal: "Produto",
    descPt: "Produto",
    descDuimp: "Produto",
    ncm: "09096110",
    ncmValido: true,
    pesoLiqKg: 1,
    fobTotalUS: 1,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
    compatibilidadeProduto: "revisar",
    ...partial,
  } as Item;
}

describe("ordem-item", () => {
  it("ordemDoItem usa item.ordem quando presente", () => {
    const itens = [item({ ordem: 10 }), item({ ordem: 20 })];
    expect(ordemDoItem(itens, 0)).toBe(10);
    expect(ordemDoItem(itens, 1)).toBe(20);
  });

  it("ordemDoItem faz fallback para idx sem ordem persistida", () => {
    const itens = [item({}), item({})];
    expect(ordemDoItem(itens, 1)).toBe(1);
  });

  it("idxPorOrdem resolve índice pelo campo ordem", () => {
    const itens = [item({ ordem: 5 }), item({ ordem: 9 })];
    expect(idxPorOrdem(itens, 9)).toBe(1);
    expect(idxPorOrdem(itens, 5)).toBe(0);
  });

  it("mesclarOrdemItensPersistidos repõe ordem após recálculo", () => {
    const ref = [item({ ordem: 0 }), item({ ordem: 7, ncm: "09030090" })];
    const calc = ref.map(({ ordem: _o, ...rest }) => ({ ...rest, ncm: rest.ncm }));
    const merged = mesclarOrdemItensPersistidos(calc, ref);
    expect(merged[1]?.ordem).toBe(7);
  });

  it("divergenciasOrdemItem detecta idx ≠ ordem", () => {
    const itens = [item({ ordem: 0 }), item({ ordem: 5, ncm: "09030090", descPt: "Erva-mate" })];
    const div = divergenciasOrdemItem(itens);
    expect(div).toHaveLength(1);
    expect(div[0]).toMatchObject({ idx: 1, ordem: 5, ncm: "09030090" });
  });

  it("itensResolucaoNcm expõe ordem persistida — só sem NCM", () => {
    const itens = [
      item({ ordem: 0, compatibilidadeProduto: "compativel" }),
      item({ ordem: 7, compatibilidadeProduto: "revisar", ncm: "" }),
    ];
    const res = itensResolucaoNcm(itens);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ idx: 1, ordem: 7 });
  });
});
