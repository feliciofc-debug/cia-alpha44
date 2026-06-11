import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
} from "@cia/shared";
import { itemBloqueiaPdfNcm, itensBloqueandoPdf } from "@cia/shared";

function item(partial: Partial<Item>): Item {
  return {
    descOriginal: "Peça",
    descPt: "Peça",
    descDuimp: "Peça",
    ncm: "87149490",
    ncmValido: true,
    pesoLiqKg: 1,
    fobTotalUS: 1,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
    ...partial,
  } as Item;
}

describe("ncm-confirmacao", () => {
  it("metaConfirmacaoNcm grava NCM e usuário", () => {
    const meta = metaConfirmacaoNcm("8714.9490", "analista@cia.test");
    expect(meta.ncmRevisadoHumano).toBe(true);
    expect(meta.ncmConfirmado).toBe("87149490");
    expect(meta.ncmConfirmadoPor).toBe("analista@cia.test");
  });

  it("confirmacao vigente só quando NCM coincide", () => {
    const confirmado = { ...item({ compatibilidadeProduto: "revisar" }), ...metaConfirmacaoNcm("87149490") };
    expect(confirmacaoNcmVigente(confirmado)).toBe(true);
    expect(confirmacaoNcmVigente({ ...confirmado, ncm: "87149990" })).toBe(false);
  });

  it("invalida confirmação quando NCM muda", () => {
    const confirmado = { ...item({ compatibilidadeProduto: "revisar" }), ...metaConfirmacaoNcm("87149490") };
    const invalidado = validarConfirmacaoNcmItem({ ...confirmado, ncm: "90319090" });
    expect(invalidado.ncmRevisadoHumano).toBe(false);
    expect(invalidado.ncmConfirmado).toBeUndefined();
    expect(itemBloqueiaPdfNcm(invalidado)).toBe(true);
  });

  it("limparConfirmacaoNcm remove rastro e PDF volta a bloquear", () => {
    const confirmado = { ...item({ compatibilidadeProduto: "revisar" }), ...metaConfirmacaoNcm("87149490") };
    expect(itemBloqueiaPdfNcm(confirmado)).toBe(false);
    const limpo = limparConfirmacaoNcm(confirmado);
    expect(limpo.ncmRevisadoHumano).toBe(false);
    expect(itemBloqueiaPdfNcm(limpo)).toBe(true);
  });
});

describe("pdf-ncm", () => {
  it("bloqueia NCM vazio e incompatível", () => {
    expect(itemBloqueiaPdfNcm(item({ ncm: "" }))).toBe(true);
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "incompativel" }))).toBe(true);
  });

  it("bloqueia revisar até confirmação humana com rastro", () => {
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "revisar" }))).toBe(true);
    expect(
      itemBloqueiaPdfNcm({
        ...item({ compatibilidadeProduto: "revisar" }),
        ...metaConfirmacaoNcm("87149490"),
      }),
    ).toBe(false);
  });

  it("bloqueia ncmValido false até confirmação", () => {
    expect(itemBloqueiaPdfNcm(item({ ncmValido: false }))).toBe(true);
    expect(
      itemBloqueiaPdfNcm({
        ...item({ ncmValido: false }),
        ...metaConfirmacaoNcm("87149490"),
      }),
    ).toBe(false);
  });

  it("compatível sem flags extras não bloqueia", () => {
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "compativel" }))).toBe(false);
    expect(itensBloqueandoPdf([item({ compatibilidadeProduto: "compativel" })])).toHaveLength(0);
  });
});
