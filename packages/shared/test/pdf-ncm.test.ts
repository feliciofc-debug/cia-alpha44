import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
} from "@cia/shared";
import { itemBloqueiaPdfNcm, itensBloqueandoPdf, itemPodeConfirmarNcm, itemPodeConfirmarNcmIndividual, itensResolucaoNcm } from "@cia/shared";

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

  it("ncmValido false sozinho não bloqueia se validarNcm ok (gate unificado)", () => {
    const ctx = { catalogExiste: () => true, validarNcm: () => ({ ok: true }) };
    expect(itemBloqueiaPdfNcm(item({ ncmValido: false, compatibilidadeProduto: "compativel" }), ctx)).toBe(
      false,
    );
  });

  it("confirmação destrava ncmValido false quando validar falharia", () => {
    const ctx = { catalogExiste: () => true, validarNcm: () => ({ ok: false, avisos: ["x"] }) };
    expect(
      itemBloqueiaPdfNcm(
        {
          ...item({ ncmValido: false }),
          ...metaConfirmacaoNcm("87149490"),
        },
        ctx,
      ),
    ).toBe(false);
  });

  it("compatível sem flags extras não bloqueia", () => {
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "compativel" }))).toBe(false);
    expect(itensBloqueandoPdf([item({ compatibilidadeProduto: "compativel" })])).toHaveLength(0);
  });

  it("itemPodeConfirmarNcm — revisar, validar falho, baixa confiança", () => {
    const ctxFalha = { catalogExiste: () => true, validarNcm: () => ({ ok: false, avisos: ["x"] }) };
    expect(itemPodeConfirmarNcm(item({ compatibilidadeProduto: "revisar" }))).toBe(true);
    expect(itemPodeConfirmarNcm(item({ compatibilidadeProduto: "compativel" }), ctxFalha)).toBe(true);
    expect(itemPodeConfirmarNcm(item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.55 }))).toBe(
      true,
    );
    expect(itemPodeConfirmarNcm(item({ ncmFonte: "pendente" }))).toBe(true);
    expect(itemPodeConfirmarNcm(item({ compatibilidadeProduto: "incompativel" }))).toBe(false);
    expect(itemPodeConfirmarNcmIndividual(item({ compatibilidadeProduto: "incompativel" }))).toBe(true);
    expect(
      itemPodeConfirmarNcm({
        ...item({ compatibilidadeProduto: "revisar" }),
        ...metaConfirmacaoNcm("87149490"),
      }),
    ).toBe(false);
  });

  it("baixa confiança só exibe botão — compatível conf 0,80 não bloqueia PDF (fix A intacto)", () => {
    const baixaConf = item({
      compatibilidadeProduto: "compativel",
      ncmValido: true,
      ncmConfianca: 0.8,
    });
    expect(itemPodeConfirmarNcm(baixaConf)).toBe(true);
    expect(itemBloqueiaPdfNcm(baixaConf)).toBe(false);
    expect(itensBloqueandoPdf([baixaConf])).toHaveLength(0);
  });

  it("incompatível confirmado pelo analista destrava PDF", () => {
    const inc = item({ compatibilidadeProduto: "incompativel" });
    expect(itemBloqueiaPdfNcm(inc)).toBe(true);
    expect(itemPodeConfirmarNcmIndividual(inc)).toBe(true);
    const confirmado = { ...inc, ...metaConfirmacaoNcm("87149490") };
    expect(itemBloqueiaPdfNcm(confirmado)).toBe(false);
  });

  it("itensResolucaoNcm inclui revisar, incompatível e validar falho", () => {
    const ctx = {
      catalogExiste: () => true,
      validarNcm: (_n: string, _d: string, _f: string) => ({ ok: false, avisos: ["incoerente"] }),
    };
    const itens = [
      item({ compatibilidadeProduto: "revisar" }),
      item({ compatibilidadeProduto: "compativel", descPt: "Amortecedor patinete", ncm: "87149490" }),
      item({ compatibilidadeProduto: "incompativel" }),
    ];
    const fila = itensResolucaoNcm(itens, ctx);
    expect(fila.map((f) => f.idx)).toEqual([0, 1, 2]);
  });
});
