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

describe("gate cotação 72 — FOB invoice no motor", () => {
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

  it("motor FOB = invoice embarque (US$ 47.036 agregado), planilha China só referência", () => {
    const itens = FIXTURE.itens as Item[];
    const alvoFob = itens.reduce((s, it) => s + (it.fobEmbarqueUS ?? it.fobTotalUS ?? 0), 0);

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

    let sumMotor = 0;
    for (const it of itensCalc) {
      sumMotor += fobUsadoNoEngine(it, it.calibracao!);
      expect(it.fobPendente).not.toBe(true);
    }

    const totalMotor = resultado!.totalBRL;

    console.log(`
=== GATE COTACAO 72 (FOB invoice) ===
FOB invoice motor: US$ ${sumMotor.toFixed(2)}
Alvo invoice:      US$ ${alvoFob.toFixed(2)}
Total BRL motor:   R$ ${totalMotor.toFixed(2)}
`);

    expect(sumMotor).toBeCloseTo(alvoFob, 0);
    expect(totalMotor).toBeCloseTo(FIXTURE.totalPauloBRL, -3);
    expect(totalMotor).toBeGreaterThan(0);
  });
});
