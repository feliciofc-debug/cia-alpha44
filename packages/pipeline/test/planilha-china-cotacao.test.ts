import { describe, it, expect, beforeEach } from "vitest";
import type { Item } from "@cia/shared";
import {
  aplicarPlanilhaChinaCotacao,
  buildBenchmarkIndex,
  substituirHistoricoBenchmark,
  fobKgParaPreenchimento,
  lookupBenchmark,
} from "../src/index.js";

function itemBase(partial: Partial<Item>): Item {
  return {
    descOriginal: "Produto",
    descPt: "Produto",
    descDuimp: "Produto",
    ncm: "00000000",
    ncmCandidatos: [],
    pesoLiqKg: 10,
    pesoBrutoKg: null,
    qtd: 1,
    fobUnitarioUS: null,
    fobTotalUS: 50,
    aliquotas: { ii: 0.16, ipi: 0.05, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ncmValido: true,
    ...partial,
  } as Item;
}

describe("aplicarPlanilhaChinaCotacao — metodologia planilha FOB/kg × bruto", () => {
  beforeEach(() => {
    substituirHistoricoBenchmark([
      { ncm: "94051190", fobKgMedioDI: 1.9072, fobKg: 1.9072, amostra: 12 },
      { ncm: "84238900", fobKgMedioDI: 4.5155, fobKg: 4.5155, amostra: 9 },
      { ncm: "85183000", fobKgMedioDI: 6.2, fobKg: 6.2, amostra: 5 },
    ]);
  });

  it("NCM na planilha China: FOB total = planilha×bruto; invoice preservada", () => {
    const index = buildBenchmarkIndex([], "ref");
    const itens = aplicarPlanilhaChinaCotacao(
      [
        itemBase({ ncm: "94051190", fobTotalUS: 100, fobEmbarqueUS: 100, pesoLiqKg: 50, pesoBrutoKg: 50, fobKgFonte: "linha" }),
        itemBase({ ncm: "84238900", fobTotalUS: 80, fobEmbarqueUS: 80, pesoLiqKg: 20, pesoBrutoKg: 20, fobKgFonte: "linha" }),
      ],
      index,
    );

    expect(itens[0]!.fobTotalUS).toBeCloseTo(1.9072 * 50, 2);
    expect(itens[0]!.fobEmbarqueUS).toBe(100);
    expect(itens[1]!.fobTotalUS).toBeCloseTo(4.5155 * 20, 2);
    for (const it of itens) {
      expect(it.fobPendente).not.toBe(true);
      expect(it.fobKgFonte).toMatch(/planilha-mensal/);
    }
    expect(fobKgParaPreenchimento(lookupBenchmark(index, "94051190"))).toBeCloseTo(1.9072, 3);
  });

  it("sem FOB embarque e NCM na China → planilha×bruto", () => {
    const index = buildBenchmarkIndex([], "ref");
    const [it] = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "84238900", fobTotalUS: 0, pesoLiqKg: 10, pesoBrutoKg: 10 })],
      index,
    );
    expect(it!.fobTotalUS).toBeCloseTo(4.5155 * 10, 2);
    expect(it!.fobPendente).not.toBe(true);
  });

  it("override manual não é alterado pela cascata", () => {
    const index = buildBenchmarkIndex([], "ref");
    const [it] = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "84238900", fobKgManual: 2.5, fobTotalUS: 100, fobEmbarqueUS: 100, pesoLiqKg: 20, pesoBrutoKg: 20 })],
      index,
    );
    expect(it!.fobKgManual).toBe(2.5);
    expect(it!.fobTotalUS).toBeCloseTo(2.5 * 20, 2);
  });

  it("recálculo idempotente: metodologia estável", () => {
    const index = buildBenchmarkIndex([], "ref");
    const once = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "84238900", fobTotalUS: 999, fobEmbarqueUS: 999, pesoLiqKg: 10, pesoBrutoKg: 10, fobKgFonte: "linha" })],
      index,
    );
    const twice = aplicarPlanilhaChinaCotacao(once, index);
    expect(twice[0]!.fobTotalUS).toBeCloseTo(4.5155 * 10, 2);
    expect(twice[0]!.fobEmbarqueUS).toBe(999);
  });

  it("linha lixo (NCM 00015423 + peso absurdo) fica pendente", () => {
    const index = buildBenchmarkIndex([], "ref");
    const [it] = aplicarPlanilhaChinaCotacao(
      [
        itemBase({
          ncm: "00015423",
          descOriginal: "linha lixo parser",
          fobTotalUS: 74_936,
          pesoLiqKg: 171_894,
          fobEmbarqueUS: 74_936,
        }),
      ],
      index,
    );
    expect(it!.fobPendente).toBe(true);
    expect(it!.fobTotalUS).toBe(0);
  });

  it("invoice corrupta (58k vs planilha 2,3k) não sobrescreve fobTotalUS", () => {
    substituirHistoricoBenchmark([
      { ncm: "84798999", fobKgMedioDI: 1.95210605, fobKg: 1.95210605, amostra: 5 },
    ]);
    const index = buildBenchmarkIndex([], "ref");
    const [it] = aplicarPlanilhaChinaCotacao(
      [
        itemBase({
          ncm: "84798999",
          fobTotalUS: 58_090,
          fobEmbarqueUS: 58_090,
          pesoLiqKg: 1113,
          pesoBrutoKg: 1209.8,
        }),
      ],
      index,
    );
    expect(it!.fobEmbarqueUS).toBe(58_090);
    expect(it!.fobTotalUS).toBeLessThan(10_000);
    expect(it!.fobTotalUS).toBeGreaterThan(0);
  });
});
