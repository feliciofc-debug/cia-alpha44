import { describe, it, expect, beforeAll } from "vitest";
import type { Item } from "@cia/shared";
import {
  buildBenchmarkIndex,
  defaultBenchmarkPlanilhaPath,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  montarLinhasConciliacao,
  resolverNcmConciliacaoPlanilhaChina,
  substituirHistoricoBenchmark,
  type BenchmarkPlanilhaEntry,
} from "../src/index.js";

let planilha: BenchmarkPlanilhaEntry[] = [];
let benchmarkIndex = buildBenchmarkIndex([]);

beforeAll(() => {
  const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
  planilha = seed?.itens ?? [];
  if (seed) {
    substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
    benchmarkIndex = buildBenchmarkIndex([]);
  }
});

function itemBase(partial: Partial<Item> & Pick<Item, "descOriginal">): Item {
  return {
    descPt: partial.descOriginal,
    descDuimp: "",
    ncm: "00000000",
    ncmCandidatos: [],
    pesoBrutoKg: 10,
    pesoLiqKg: 9,
    qtd: 1,
    fobUnitarioUS: 0,
    fobTotalUS: 0,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ...partial,
  } as Item;
}

describe("planilha-china-ncm — conciliação", () => {
  it("balança: NCM planilha China (84233090) prevalece sobre Siscomex operacional", () => {
    const hit = resolverNcmConciliacaoPlanilhaChina(
      itemBase({
        descOriginal: "HY-97 — 挂钩秤",
        descPt: "Balança de gancho",
        ncm: "84238900",
        ncmFonte: "siscomex",
        ncmCandidatos: [{ ncm: "84233090", confianca: 0.9 }],
      }),
      planilha,
      benchmarkIndex,
    );
    expect(hit?.ncm).toBe("84233090");
    expect(hit?.fobKgMedioDI).toBeCloseTo(2.8942, 3);
  });

  it("montarLinhasConciliacao exporta ncmFonte planilha China + FOB/kg da linha", () => {
    const [linha] = montarLinhasConciliacao(
      [
        itemBase({
          descOriginal: "HY-97 — 挂钩秤",
          descPt: "Balança de gancho",
          ncm: "84238900",
          ncmFonte: "siscomex",
          ncmCandidatos: [{ ncm: "84233090", confianca: 0.9 }],
        }),
      ],
      { planilhaChina: planilha, benchmarkIndex },
    );
    expect(linha!.ncm).toBe("84233090");
    expect(linha!.ncmFonte).toBe("planilha China");
    expect(Number(String(linha!.fobKg).replace(",", "."))).toBeCloseTo(2.8942, 3);
    expect(linha!.fobKgFonte).toContain("Planilha China");
  });
});
