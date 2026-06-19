import { describe, it, expect, beforeEach } from "vitest";
import {
  buildBenchmarkIndex,
  lookupBenchmark,
  substituirHistoricoBenchmark,
  calibrarFobKg,
  fobKgParaPreenchimento,
} from "../src/index.js";

const NCM_LUSTRE = "94051190";
const MEDIO_DI = 1.90724668715675;

describe("hierarquia FOB/kg — planilha INNOVE antes de ComexStat", () => {
  beforeEach(() => {
    substituirHistoricoBenchmark([
      {
        ncm: NCM_LUSTRE,
        fobKgMedioDI: MEDIO_DI,
        fobKgPonderado: 4.5163,
        fobKg: MEDIO_DI,
        amostra: 12,
      },
    ]);
  });

  it("lookupBenchmark usa histórico próprio (média DI), não ComexStat ponderada", () => {
    const index = buildBenchmarkIndex(
      [{ ncm: NCM_LUSTRE, desc: "L", fobKg: 4.49, cifKg: 5, amostra: 1 }],
      "China",
    );
    const b = lookupBenchmark(index, NCM_LUSTRE);
    expect(b.fonte).toBe("Histórico próprio");
    expect(fobKgParaPreenchimento(b)).toBeCloseTo(MEDIO_DI, 4);
  });

  it("calibrador fixa FOB/kg na média DI da planilha operacional", () => {
    const index = buildBenchmarkIndex([], "ref");
    const benchmark = lookupBenchmark(index, NCM_LUSTRE);
    const cal = calibrarFobKg({ fobKgOriginal: 2.15, pesoLiqKg: 100, benchmark });
    expect(cal.fobKgCalibrado).toBeCloseTo(MEDIO_DI, 4);
    expect(cal.ajustado).toBe(false);
  });

  it("lookup NCM próximo (94052100) herda histórico 94051190", () => {
    const index = buildBenchmarkIndex([], "ref");
    const b = lookupBenchmark(index, "94052100");
    expect(b.fonte).toBe("Histórico próprio");
    expect(fobKgParaPreenchimento(b)).toBeCloseTo(MEDIO_DI, 4);
    expect(b.nota).toMatch(/via|9405/i);
  });
});
