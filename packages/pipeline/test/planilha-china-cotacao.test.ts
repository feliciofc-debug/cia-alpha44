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

describe("aplicarPlanilhaChinaCotacao — regra global em todos os itens", () => {
  beforeEach(() => {
    substituirHistoricoBenchmark([
      { ncm: "94051190", fobKgMedioDI: 1.9072, fobKg: 1.9072, amostra: 12 },
      { ncm: "84238900", fobKgMedioDI: 4.5155, fobKg: 4.5155, amostra: 9 },
      { ncm: "85183000", fobKgMedioDI: 6.2, fobKg: 6.2, amostra: 5 },
    ]);
  });

  it("todos os NCMs na planilha China recebem PREÇO FOB/KG — mesmo com FOB de embarque", () => {
    const index = buildBenchmarkIndex([], "ref");
    const itens = aplicarPlanilhaChinaCotacao(
      [
        itemBase({ ncm: "94051190", fobTotalUS: 100, pesoLiqKg: 50, fobKgFonte: "linha" }),
        itemBase({ ncm: "84238900", fobTotalUS: 80, pesoLiqKg: 20, fobKgFonte: "linha" }),
        itemBase({ ncm: "85183000", fobTotalUS: 30, pesoLiqKg: 5, fobKgFonte: "linha" }),
      ],
      index,
    );

    expect(itens[0]!.fobTotalUS).toBeCloseTo(1.9072 * 50, 2);
    expect(itens[1]!.fobTotalUS).toBeCloseTo(4.5155 * 20, 2);
    expect(itens[2]!.fobTotalUS).toBeCloseTo(6.2 * 5, 2);
    for (const it of itens) {
      expect(it.fobKgFonte).toMatch(/planilha-mensal/);
    }
  });

  it("NCM ausente na planilha China cai no ComexStat", () => {
    const index = buildBenchmarkIndex(
      [{ ncm: "99999999", desc: "X", fobKg: 3.33, cifKg: 3.5, amostra: 1 }],
      "ref",
    );
    const [it] = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "99999999", fobTotalUS: null as unknown as number, pesoLiqKg: 10 })],
      index,
    );
    const bench = lookupBenchmark(index, "99999999");
    expect(bench.fonte).toBe("ComexStat");
    expect(it!.fobTotalUS).toBeCloseTo(3.33 * 10, 2);
    expect(it!.fobKgFonte).toMatch(/comexstat/);
  });

  it("override manual não é substituído pela planilha China", () => {
    const index = buildBenchmarkIndex([], "ref");
    const [it] = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "84238900", fobKgManual: 2.5, fobTotalUS: 100, pesoLiqKg: 20 })],
      index,
    );
    expect(it!.fobTotalUS).toBe(100);
    expect(it!.fobKgManual).toBe(2.5);
  });

  it("recálculo idempotente mantém valores da planilha", () => {
    const index = buildBenchmarkIndex([], "ref");
    const once = aplicarPlanilhaChinaCotacao(
      [itemBase({ ncm: "84238900", fobTotalUS: 999, pesoLiqKg: 10, fobKgFonte: "linha" })],
      index,
    );
    const twice = aplicarPlanilhaChinaCotacao(once, index);
    expect(twice[0]!.fobTotalUS).toBeCloseTo(4.5155 * 10, 2);
    expect(fobKgParaPreenchimento(lookupBenchmark(index, "84238900"))).toBeCloseTo(4.5155, 3);
  });
});
