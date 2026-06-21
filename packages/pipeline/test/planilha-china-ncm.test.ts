import { describe, it, expect, beforeAll } from "vitest";
import type { Item } from "@cia/shared";
import {
  buildBenchmarkIndex,
  defaultBenchmarkPlanilhaPath,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  montarLinhasConciliacao,
  resolverNcmClassificacaoPlanilhaChina,
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

describe("planilha-china-ncm — classificação operacional", () => {
  it("linha embarque: NCM coluna na planilha China antes de Gemini", () => {
    const hit = resolverNcmClassificacaoPlanilhaChina(
      { descOriginal: "HY-97 — 挂钩秤", ncm: "84233090", material: null, uso: null },
      planilha,
      benchmarkIndex,
    );
    expect(hit?.ncm).toBe("84233090");
  });

  it("sem NCM coluna: busca textual na planilha China", () => {
    const hit = resolverNcmClassificacaoPlanilhaChina(
      { descOriginal: "Balança de gancho digital HY-97", ncm: null, material: null, uso: null },
      planilha,
      benchmarkIndex,
    );
    expect(hit?.ncm).toBeTruthy();
    expect(hit!.score).toBeGreaterThan(0);
  });

  it("Pipoqueira Preta: família eletrodoméstico — NÃO tinta 32151100", () => {
    const hit = resolverNcmClassificacaoPlanilhaChina(
      {
        descOriginal: "HY-5110 — Pipoqueira Preta 220V Plug Redondo",
        ncm: null,
        material: null,
        uso: null,
      },
      planilha,
      benchmarkIndex,
    );
    expect(hit?.ncm).not.toBe("32151100");
    expect(hit?.ncm?.startsWith("8516")).toBe(true);
  });

  it("Secadora de roupa: capítulo 8450 — NÃO máquina de costura 8451", () => {
    const hit = resolverNcmClassificacaoPlanilhaChina(
      {
        descOriginal: "Secadora inteligente de uso doméstico",
        ncm: null,
        material: null,
        uso: null,
      },
      planilha,
      benchmarkIndex,
    );
    expect(hit?.ncm?.startsWith("8450")).toBe(true);
    expect(hit?.ncm?.startsWith("8451")).toBe(false);
  });
});

describe("planilha-china-ncm — conciliação", () => {
  it("balança: NCM planilha China (84233090) prevalece sobre Siscomex operacional", () => {
    const hit = resolverNcmConciliacaoPlanilhaChina(
      itemBase({
        descOriginal: "HY-97 — 挂钩秤",
        descPt: "Balança de gancho",
        ncm: "84233090",
        ncmFonte: "ia",
        ncmClassificacaoCache: "humano",
        ncmRevisadoHumano: true,
        ncmCandidatos: [{ ncm: "84238900", confianca: 0.9 }],
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
          ncm: "84233090",
          ncmFonte: "ia",
          ncmClassificacaoCache: "humano",
        ncmRevisadoHumano: true,
          ncmCandidatos: [{ ncm: "84238900", confianca: 0.9 }],
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
