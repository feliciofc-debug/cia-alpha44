import { describe, expect, it } from "vitest";
import {
  avisoNcmReferencia,
  mesclarItemMeta,
  ncmColunaEmbarqueParaClassificacao,
  referenciaNcmLegado,
} from "../src/item-meta.js";
import type { Item } from "@cia/shared";

const base: Item = {
  descOriginal: "HY-97;挂钩秤;Balança",
  descPt: "HY-97 — Balança",
  descDuimp: "",
  ncm: "84238200",
  ncmCandidatos: [],
  ncmValido: true,
  pesoLiqKg: 1,
  qtd: 1,
  fobTotalUS: 10,
  aliquotas: { ii: 0, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
  aliquotasOverride: false,
  anuencia: [],
  antidumping: false,
};

describe("ncmColunaEmbarqueParaClassificacao", () => {
  it("coluna real — retorna NCM da coluna", () => {
    expect(
      ncmColunaEmbarqueParaClassificacao({
        ncmEmbarqueStatus: "coluna",
        ncmEmbarque: "84238900",
      }),
    ).toBe("84238900");
  });

  it("sem coluna com meta injetado — null (não autoridade planilha-cliente)", () => {
    expect(
      ncmColunaEmbarqueParaClassificacao({
        ncmEmbarqueStatus: "sem-ncm-coluna",
        ncmPlanilhaOriginal: "84238900",
        ncmEmbarque: "84238900",
      }),
    ).toBeNull();
  });

  it("herança família — retorna ncmEmbarque herdado", () => {
    expect(
      ncmColunaEmbarqueParaClassificacao({
        ncmEmbarqueStatus: "heranca-familia",
        ncmEmbarque: "87116000",
      }),
    ).toBe("87116000");
  });
});

describe("referenciaNcmLegado / mesclarItemMeta", () => {
  it("meta injetado sem coluna → ncmReferencia + aviso honesto", () => {
    const meta = {
      ncmEmbarqueStatus: "sem-ncm-coluna" as const,
      ncmPlanilhaOriginal: "84238900",
    };
    expect(referenciaNcmLegado(meta)).toBe("84238900");
    expect(avisoNcmReferencia("84238900")).toBe("NCM de referência — conferir: 84238900.");

    const it = mesclarItemMeta(base, meta);
    expect(it.ncmReferencia).toBe("84238900");
    expect(it.ncmPlanilhaOriginal).toBeUndefined();
    expect(it.ncmEmbarque).toBeNull();
    expect(it.ncmAvisos?.some((a) => a.includes("referência"))).toBe(true);
    expect(it.ncmAvisos?.some((a) => a.includes("declarado na planilha"))).toBe(false);
  });
});
