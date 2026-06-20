import { describe, it, expect, beforeEach } from "vitest";
import type { Item } from "@cia/shared";
import {
  montarLinhasConciliacao,
  substituirHistoricoBenchmark,
  buildBenchmarkIndex,
  lookupBenchmark,
} from "../src/index.js";

function item(ncm: string, partial: Partial<Item> = {}): Item {
  return {
    descOriginal: "Produto teste",
    descPt: "Produto",
    descDuimp: "Produto",
    ncm,
    ncmCandidatos: [],
    pesoLiqKg: 10,
    fobTotalUS: 45.15,
    aliquotas: { ii: 0.16, ipi: 0.05, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ncmValido: true,
    ...partial,
  } as Item;
}

describe("relatório conciliação — fonte FOB/kg", () => {
  beforeEach(() => {
    substituirHistoricoBenchmark([
      { ncm: "84238900", fobKgMedioDI: 4.5155, fobKg: 4.5155, amostra: 9 },
    ]);
  });

  it("coluna fobKgFonte indica Planilha China quando benchmark é Histórico próprio", () => {
    const index = buildBenchmarkIndex([], "ref");
    const bench = lookupBenchmark(index, "84238900");
    const planilhaChina = [
      {
        ncm: "84238900",
        desc: "Produto teste balanças",
        fobKgMedioDI: 4.5155,
        fobKgPonderado: null,
        cifKg: null,
        amostra: 9,
        fobKg: 4.5155,
      },
    ];
    const linhas = montarLinhasConciliacao(
      [
        item("84238900", {
          benchmark: bench,
          fobKgFonte: bench.rastroFonte ?? "planilha-mensal",
          calibracao: {
            fobKgOriginal: 2.89,
            fobKgCalibrado: 4.5155,
            desvioBenchmarkPct: -36,
            ajustado: false,
            justificativa: "planilha",
          },
        }),
      ],
      { planilhaChina, benchmarkIndex: index },
    );
    expect(linhas[0]!.fobKgFonte).toContain("Planilha China");
    expect(linhas[0]!.fobKg).toBe("4,5155");
    expect(linhas[0]!.ncmFonte).toBe("planilha China");
  });

  it("coluna fobKgFonte indica ComexStat quando NCM fora da planilha", () => {
    const index = buildBenchmarkIndex(
      [{ ncm: "99999999", desc: "X", fobKg: 3.33, cifKg: 3.5, amostra: 1 }],
      "ref",
    );
    const bench = lookupBenchmark(index, "99999999");
    const linhas = montarLinhasConciliacao(
      [item("99999999", { benchmark: bench, fobKgFonte: bench.rastroFonte ?? "comexstat" })],
      { planilhaChina: [], benchmarkIndex: index },
    );
    expect(linhas[0]!.fobKgFonte).toContain("ComexStat");
  });
});
