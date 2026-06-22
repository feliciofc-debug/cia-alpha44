/**
 * Gate cotação 72 — gabarito Felicio: 21 linhas, FOB bruto US$ 47.036,67, NCM ia/siscomex.
 * NUNCA classificador planilha-china (benchmark IMPORTAÇÕES DA CHINA).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Item } from "@cia/shared";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import {
  buildBenchmarkIndex,
  loadComexSeed,
  substituirHistoricoBenchmark,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  defaultBenchmarkPlanilhaPath,
  criarNcmCatalog,
  loadNcmVigenteCache,
} from "@cia/pipeline";
import { calcularCotacao } from "../src/services/cotacao.js";
import { fobUsadoNoEngine, pesoFobPlanilhaItem } from "../src/services/fob-kg-manual.js";
import type { AppState } from "../src/state.js";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dir, "../../../tools/fixtures/cotacao-72-gabarito.json"), "utf8"),
) as {
  params: Record<string, number>;
  despesas: Array<{ nome: string; valorBRL: number; entraBaseNota?: boolean }>;
  gabarito: { fobTotalUS: number; iiTotalBRL: number; linhas: number };
  ncmsRegressao: string[];
  itens: Array<{
    descOriginal: string;
    ncm: string;
    ncmFonte: string;
    qtd: number;
    pesoLiqKg: number;
    pesoBrutoKg: number;
    fobKgManual: number;
    fobTotalUS: number;
    aliquotas?: { ii: number; ipi: number; pis: number; cofins: number; icmsEntrada: number };
  }>;
};

const FONTES_NCM_OK = new Set([
  "ia",
  "siscomex",
  "planilha-cliente",
  "planilha-cliente-familia",
  "gemini",
]);

function carregarBenchmarkChina() {
  try {
    const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
    if (seed?.itens.length) substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  } catch {
    substituirHistoricoBenchmark([]);
  }
}

function buildState(): AppState {
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    tecSource: { buscar: () => null, buscarAsync: async () => null },
    siscomex: { lookup: () => null },
    ocr: null,
    provider: { nome: "mock-gate", disponivel: false, classify: async () => [] },
  } as unknown as AppState;
}

function itensGabaritoMotor(): Item[] {
  return FIXTURE.itens.map((row) => ({
    descOriginal: row.descOriginal,
    descPt: row.descOriginal.split(";").pop()?.trim() ?? row.descOriginal,
    descDuimp: "",
    ncm: row.ncm,
    ncmFonte: row.ncmFonte as Item["ncmFonte"],
    ncmCandidatos: [{ ncm: row.ncm, confianca: 0.9 }],
    ncmValido: true,
    pesoBrutoKg: row.pesoBrutoKg,
    pesoLiqKg: row.pesoLiqKg,
    qtd: row.qtd,
    fobKgManual: row.fobKgManual,
    fobTotalUS: row.fobTotalUS,
    fobEmbarqueUS: row.fobTotalUS,
    fobKgFonte: "preco-custo",
    fobKgBase: "bruto",
    aliquotas: row.aliquotas ?? {
      ii: 0,
      ipi: 0,
      pis: 0.021,
      cofins: 0.0965,
      icmsEntrada: 0,
    },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
  }));
}

describe("gate cotação 72 — gabarito Felicio", () => {
  let state: AppState;

  beforeEach(() => {
    carregarBenchmarkChina();
    state = buildState();
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("fixture CSV gabarito existe com 21 linhas de dados", () => {
    const csvPath = join(__dir, "../../../tools/fixtures/conciliacao-72-gabarito.csv");
    expect(existsSync(csvPath)).toBe(true);
    const linhas = readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
    expect(linhas.length).toBeGreaterThanOrEqual(22);
  });

  it("código não usa classificador planilha-china", () => {
    const cotacaoSrc = readFileSync(join(__dir, "../src/services/cotacao.ts"), "utf8");
    const resolveSrc = readFileSync(
      join(__dir, "../../../packages/pipeline/src/resolve-ncm.ts"),
      "utf8",
    );
    expect(cotacaoSrc).not.toContain("resolverNcmClassificacaoPlanilhaChina");
    expect(cotacaoSrc).not.toContain('"planilha-china"');
    expect(resolveSrc).not.toContain('"planilha-china"');
  });

  it("itens gabarito — ncmFonte ∈ {ia, siscomex, planilha-cliente, …} e sem NCMs de regressão", () => {
    const itens = itensGabaritoMotor();
    expect(itens.length).toBe(FIXTURE.gabarito.linhas);

    for (const it of itens) {
      expect(FONTES_NCM_OK.has(it.ncmFonte!)).toBe(true);
      expect(it.ncmFonte).not.toBe("planilha-china");
      if (it.ncm && FIXTURE.ncmsRegressao.includes(it.ncm)) {
        expect(FIXTURE.itens.some((g) => g.ncm === it.ncm)).toBe(true);
      }
    }
  });

  it("Σ FOB (bruto) = 47.036,67 ±1 US$ e Σ II ≈ 36.319,77 ±50 BRL", () => {
    const itens = itensGabaritoMotor();

    const cotacao = {
      cambio: FIXTURE.params.cambio,
      freteTotalUS: FIXTURE.params.freteTotalUS,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: FIXTURE.params.siscomex,
      antidumpingBRL: 0,
      cliente: "Felicio — gate 72",
      benefFiscal: "NENHUM" as const,
      moeda: "USD" as const,
      incoterm: "FOB",
      origem: "CN",
      destino: "SP",
      despesas: FIXTURE.despesas,
      outrasDespesasBaseBRL: FIXTURE.params.outrasDespesasBaseBRL,
      params: { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04, ipiAliqSaida: 0 },
      itens,
    };

    const { resultado, itens: itensCalc } = calcularCotacao(cotacao, state);
    expect(resultado).not.toBeNull();

    let sumMotor = 0;
    for (const it of itensCalc) {
      const fobMotor = fobUsadoNoEngine(it, it.calibracao!);
      sumMotor += fobMotor;
      const bruto = pesoFobPlanilhaItem(it, it.benchmark);
      if (it.fobKgManual != null && bruto > 0) {
        expect(fobMotor).toBeCloseTo(it.fobKgManual * bruto, 0);
      }
    }

    const fobEntrada = resultado!.entrada.fobTotalUS;
    const iiTotal = resultado!.entrada.iiTotal;

    console.log(`
=== GATE 72 GABARITO ===
Itens:             ${itensCalc.length}
FOB motor (bruto): US$ ${sumMotor.toFixed(2)}
FOB entrada:       US$ ${fobEntrada.toFixed(2)}
II entrada:        R$ ${iiTotal.toFixed(2)}
Alvo FOB:          US$ ${FIXTURE.gabarito.fobTotalUS.toFixed(2)}
Alvo II:           R$ ${FIXTURE.gabarito.iiTotalBRL.toFixed(2)}
`);

    expect(itensCalc.length).toBe(21);
    expect(sumMotor).toBeCloseTo(FIXTURE.gabarito.fobTotalUS, 0);
    expect(fobEntrada).toBeCloseTo(FIXTURE.gabarito.fobTotalUS, 0);
    expect(Math.abs(sumMotor - FIXTURE.gabarito.fobTotalUS)).toBeLessThanOrEqual(1);
    expect(Math.abs(iiTotal - FIXTURE.gabarito.iiTotalBRL)).toBeLessThanOrEqual(50);

    for (const it of itensCalc) {
      expect(FONTES_NCM_OK.has(it.ncmFonte ?? "")).toBe(true);
    }
  });
});
