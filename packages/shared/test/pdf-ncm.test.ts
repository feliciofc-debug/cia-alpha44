import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import {
  confirmacaoNcmVigente,
  limparConfirmacaoNcm,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
} from "@cia/shared";
import {
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itensBloqueandoPdf,
  itemPodeConfirmarNcm,
  itemPodeConfirmarNcmIndividual,
  itensResolucaoNcm,
} from "@cia/shared";

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

  it("invalida confirmação quando NCM muda — PDF segue liberado se NCM informado", () => {
    const confirmado = { ...item({ compatibilidadeProduto: "revisar" }), ...metaConfirmacaoNcm("87149490") };
    const invalidado = validarConfirmacaoNcmItem({ ...confirmado, ncm: "90319090" });
    expect(invalidado.ncmRevisadoHumano).toBe(false);
    expect(invalidado.ncmConfirmado).toBeUndefined();
    expect(itemBloqueiaPdfNcm(invalidado)).toBe(false);
  });

  it("limparConfirmacaoNcm remove rastro — NCM informado continua OK", () => {
    const confirmado = { ...item({ compatibilidadeProduto: "revisar" }), ...metaConfirmacaoNcm("87149490") };
    expect(itemBloqueiaPdfNcm(confirmado)).toBe(false);
    const limpo = limparConfirmacaoNcm(confirmado);
    expect(limpo.ncmRevisadoHumano).toBe(false);
    expect(itemBloqueiaPdfNcm(limpo)).toBe(false);
  });
});

describe("pdf-ncm — NCM informado aceito", () => {
  it("bloqueia só NCM vazio", () => {
    expect(itemBloqueiaPdfNcm(item({ ncm: "" }))).toBe(true);
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "incompativel" }))).toBe(false);
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "revisar" }))).toBe(false);
  });

  it("ncmValido false não bloqueia se NCM informado", () => {
    expect(itemBloqueiaPdfNcm(item({ ncmValido: false, compatibilidadeProduto: "revisar" }))).toBe(false);
  });

  it("compatível e revisar com NCM não bloqueiam", () => {
    expect(itemBloqueiaPdfNcm(item({ compatibilidadeProduto: "compativel" }))).toBe(false);
    expect(itensBloqueandoPdf([item({ compatibilidadeProduto: "compativel" })])).toHaveLength(0);
  });

  it("itemPodeConfirmarNcm — gemini/IA e sem coluna podem confirmar", () => {
    expect(itemPodeConfirmarNcm(item({ ncm: "" }))).toBe(false);
    expect(itemPodeConfirmarNcm(item({ ncmFonte: "gemini" }))).toBe(true);
    expect(itemPodeConfirmarNcm(item({ ncmEmbarqueStatus: "sem-ncm-coluna", ncmFonte: "gemini" }))).toBe(true);
    expect(
      itemPodeConfirmarNcmIndividual(item({ ncmFonte: "planilha-cliente", compatibilidadeProduto: "compativel" })),
    ).toBe(false);
    expect(itemPodeConfirmarNcmIndividual(item({ compatibilidadeProduto: "incompativel" }))).toBe(true);
  });

  it("baixa confiança com NCM não entra na barra", () => {
    const baixaConf = item({ compatibilidadeProduto: "compativel", ncmConfianca: 0.8 });
    expect(itemBloqueiaPdfNcm(baixaConf)).toBe(false);
    expect(itemPrecisaResolucaoNcm(baixaConf)).toBe(false);
  });

  it("ncmFonte pendente com dígitos — libera PDF", () => {
    const pend = item({ ncm: "95030097", ncmFonte: "pendente", compatibilidadeProduto: "compativel" });
    expect(itemBloqueiaPdfNcm(pend)).toBe(false);
    expect(itemPrecisaResolucaoNcm(pend)).toBe(false);
  });

  it("itensResolucaoNcm — só itens sem NCM", () => {
    const itens = [
      item({ compatibilidadeProduto: "revisar" }),
      item({ ncm: "" }),
      item({ compatibilidadeProduto: "incompativel" }),
    ];
    const fila = itensResolucaoNcm(itens);
    expect(fila.map((f) => f.idx)).toEqual([1]);
  });
});
