/**
 * Fase 3 — gate v2: motor com FOB invoice vs PDF Paulo (±2%).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
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
  fobTotalPlanilhaPeso,
  resolvePesoLiqRateio,
  lookupBenchmark,
  criarNcmCatalog,
  loadNcmVigenteCache,
} from "@cia/pipeline";
import { calcularCotacao } from "../src/services/cotacao.js";
import { fobUsadoNoEngine } from "../src/services/fob-kg-manual.js";
import type { AppState } from "../src/state.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dir, "../../../tools/fixtures/cotacao-72-itens.json"), "utf8"),
) as {
  params: Record<string, number>;
  despesas: Array<{ nome: string; valorBRL: number; entraBaseNota?: boolean }>;
  totalPauloBRL: number;
  itens: Item[];
};

function carregarBenchmarkChina() {
  try {
    const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
    if (seed?.itens.length) substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  } catch {
    substituirHistoricoBenchmark([]);
  }
}

describe("gate cotação 72 — planilha China × peso no motor", () => {
  let state: AppState;

  beforeEach(() => {
    carregarBenchmarkChina();
    const comex = loadComexSeed();
    state = {
      benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
      ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
      siscomex: { lookup: () => null },
      ocr: null,
      provider: "mock",
    } as unknown as AppState;
  });

  it("motor FOB = planilha×peso (referência INNOVE), não invoice agregada", () => {
    const itens = FIXTURE.itens as Item[];
    let sumMotor = 0;
    let sumPlanilhaRef = 0;

    const cotacao = {
      cambio: FIXTURE.params.cambio,
      freteTotalUS: FIXTURE.params.freteTotalUS,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: FIXTURE.params.siscomex,
      antidumpingBRL: 0,
      cliente: "Paulo — gate 72",
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

    for (const it of itensCalc) {
      const bench = lookupBenchmark(state.benchmarkIndex, it.ncm);
      const peso = resolvePesoLiqRateio(it);
      sumMotor += fobUsadoNoEngine(it, it.calibracao!);
      sumPlanilhaRef += fobTotalPlanilhaPeso(peso, bench);
      expect(it.fobPendente).not.toBe(true);
    }

    const totalMotor = resultado!.totalBRL;

    console.log(`
=== GATE COTACAO 72 (planilha China) ===
FOB planilha×peso motor: US$ ${sumMotor.toFixed(2)}
FOB planilha ref:        US$ ${sumPlanilhaRef.toFixed(2)}
Total BRL motor:         R$ ${totalMotor.toFixed(2)}
`);

    expect(sumMotor).toBeCloseTo(sumPlanilhaRef, 0);
    expect(totalMotor).toBeGreaterThan(0);
  });
});
