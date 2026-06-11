import { describe, it, expect } from "vitest";
import {
  PRECO_CUSTO_MOTO_USD,
  PRECO_CUSTO_PATINETE_USD,
  aplicarPrecoCustoLinha,
  detectarPrecoCusto,
  isUsoPeca,
  pesoCompativelVeiculo,
} from "../src/preco-custo.js";

describe("preco-custo — moto e patinete", () => {
  it("detecta moto elétrica", () => {
    expect(detectarPrecoCusto("Moto elétrica 2000W")).toBe("moto_eletrica");
    expect(detectarPrecoCusto("Electric motorcycle 72V")).toBe("moto_eletrica");
  });

  it("detecta patinete elétrico", () => {
    expect(detectarPrecoCusto("Patinete elétrico Xiaomi")).toBe("patinete_eletrico");
    expect(detectarPrecoCusto("E-scooter kick scooter")).toBe("patinete_eletrico");
  });

  it("aplica US$ 300/un × qtd para moto", () => {
    const r = aplicarPrecoCustoLinha({
      descOriginal: "Moto elétrica modelo X",
      ncm: null,
      qtd: 10,
      pesoBrutoKg: 500,
      pesoLiqKg: 450,
      fobUnitarioUS: null,
      fobTotalUS: 9999,
    });
    expect(r.fobUnitarioUS).toBe(PRECO_CUSTO_MOTO_USD);
    expect(r.fobTotalUS).toBe(3000);
  });

  it("aplica US$ 109/un × qtd para patinete", () => {
    const r = aplicarPrecoCustoLinha({
      descOriginal: "Patinete elétrico PRO",
      ncm: "95030099",
      qtd: 50,
      pesoBrutoKg: 1150,
      pesoLiqKg: 1000,
      fobUnitarioUS: 80,
      fobTotalUS: 4000,
    });
    expect(r.fobUnitarioUS).toBe(PRECO_CUSTO_PATINETE_USD);
    expect(r.fobTotalUS).toBe(5450);
  });

  it("ignora produtos fora das famílias", () => {
    const r = aplicarPrecoCustoLinha({
      descOriginal: "Lustre de teto LED",
      ncm: "94052100",
      qtd: 1,
      pesoBrutoKg: 10,
      pesoLiqKg: 9,
      fobUnitarioUS: 780,
      fobTotalUS: 780,
    });
    expect(r.fobTotalUS).toBe(780);
  });
});

describe("preco-custo — guard-rails peça vs produto completo", () => {
  it("rejeita uso 配件 / acessório / parte / spare", () => {
    expect(isUsoPeca("配件")).toBe(true);
    expect(isUsoPeca("acessório")).toBe(true);
    expect(isUsoPeca("parte")).toBe(true);
    expect(
      detectarPrecoCusto({
        descOriginal: "Patinete elétrico PRO",
        uso: "配件",
        pesoLiqKg: 1000,
        qtd: 50,
      }),
    ).toBeNull();
  });

  it("não usa descPt — amortecedor para patinete com uso 配件 → null", () => {
    expect(
      detectarPrecoCusto({
        descOriginal: "ACC-ES-SSA001 — 减震器",
        ncm: "87149990",
        uso: "配件",
        pesoLiqKg: 16,
        qtd: 4,
      }),
    ).toBeNull();
  });

  it("peso unitário ≤ 5 kg bloqueia preço-custo", () => {
    expect(
      pesoCompativelVeiculo({ descOriginal: "x", pesoLiqKg: 16, qtd: 4 }),
    ).toBe(false);
    expect(
      detectarPrecoCusto({
        descOriginal: "滑板车T1 MAX",
        uso: "骑行",
        pesoLiqKg: 16,
        qtd: 4,
      }),
    ).toBeNull();
  });

  it("patinete completo 滑板车 + uso 骑行 + peso 20 kg/un mantém preço-custo", () => {
    expect(
      detectarPrecoCusto({
        descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色）",
        ncm: "87116000",
        uso: "骑行",
        pesoLiqKg: 10000,
        qtd: 500,
      }),
    ).toBe("patinete_eletrico");

    const r = aplicarPrecoCustoLinha({
      descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色）",
      ncm: "87116000",
      uso: "骑行",
      qtd: 500,
      pesoLiqKg: 10000,
      pesoBrutoKg: 11500,
      fobUnitarioUS: 140.58,
      fobTotalUS: 70290,
    });
    expect(r.fobUnitarioUS).toBe(PRECO_CUSTO_PATINETE_USD);
    expect(r.fobTotalUS).toBe(500 * PRECO_CUSTO_PATINETE_USD);
  });

  it("amortecedor 0,12 US$ → cascata normal (nunca preco-custo)", () => {
    const r = aplicarPrecoCustoLinha({
      descOriginal: "ACC-ES-SSA001 — 减震器",
      ncm: "87149990",
      uso: "配件",
      qtd: 4,
      pesoLiqKg: 16,
      pesoBrutoKg: 16.4,
      fobUnitarioUS: 0.12,
      fobTotalUS: 0.48,
    });
    expect(r.fobUnitarioUS).toBe(0.12);
    expect(r.fobTotalUS).toBe(0.48);
  });
});
