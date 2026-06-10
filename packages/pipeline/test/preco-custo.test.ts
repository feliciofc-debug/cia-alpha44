import { describe, it, expect } from "vitest";
import {
  PRECO_CUSTO_MOTO_USD,
  PRECO_CUSTO_PATINETE_USD,
  aplicarPrecoCustoLinha,
  detectarPrecoCusto,
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
      pesoBrutoKg: 200,
      pesoLiqKg: 180,
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
