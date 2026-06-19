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

  it("calibrador usa planilha China mesmo com FOB da planilha de embarque", () => {
    const index = buildBenchmarkIndex([], "ref");
    const benchmark = lookupBenchmark(index, NCM_LUSTRE);
    const cal = calibrarFobKg({
      fobKgOriginal: 2.15,
      pesoLiqKg: 100,
      benchmark,
      fobKgFonte: "linha",
    });
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

  it("84238900 usa PREÇO FOB/KG da planilha (4,5155 — não confundir com 84233090)", () => {
    const fs = require("node:fs");
    const seed = JSON.parse(
      fs.readFileSync("src/data/benchmark-fob-kg-innove.json", "utf8"),
    );
    substituirHistoricoBenchmark(
      seed.itens.map((e: { ncm: string; fobKgMedioDI: number; fobKgPonderado: number | null; amostra: number }) => ({
        ncm: e.ncm,
        fobKgMedioDI: e.fobKgMedioDI,
        fobKgPonderado: e.fobKgPonderado,
        fobKg: e.fobKgMedioDI,
        amostra: e.amostra,
      })),
    );
    const index = buildBenchmarkIndex([], "ref");
    const b = lookupBenchmark(index, "84238900");
    expect(b.fonte).toBe("Histórico próprio");
    expect(fobKgParaPreenchimento(b)).toBeCloseTo(4.51547605, 4);
    const viz = seed.itens.find((e: { ncm: string }) => e.ncm === "84233090");
    expect(viz?.fobKgMedioDI).toBeCloseTo(2.89417593, 4);
  });
});
