/**
 * Gate cotação 72 — metodologia empresa: FOB DI = planilha FOB/kg × peso bruto.
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
  fobKgParaPreenchimento,
} from "@cia/pipeline";
import { calcularCotacao } from "../src/services/cotacao.js";
import { fobUsadoNoEngine, pesoFobPlanilhaItem } from "../src/services/fob-kg-manual.js";
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

function fobKgPlanilha(it: Item): number | null {
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  const v = fobKgParaPreenchimento(it.benchmark);
  return v != null && v > 0 ? v : null;
}

describe("gate cotação 72 — metodologia planilha×bruto", () => {
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

  it("motor FOB = fobKg planilha × peso bruto em cada linha", () => {
    const itens = FIXTURE.itens as Item[];

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
      const fobMotor = fobUsadoNoEngine(it, it.calibracao!);
      sumMotor += fobMotor;
      expect(it.fobPendente).not.toBe(true);

      const bruto = pesoFobPlanilhaItem(it, it.benchmark);
      const fobKg = fobKgPlanilha(it);
      if (fobKg != null && bruto > 0) {
        expect(fobMotor).toBeCloseTo(fobKg * bruto, 0);
        expect(it.fobTotalUS).toBeCloseTo(fobKg * bruto, 0);
      }
    }

    const totalMotor = resultado!.totalBRL;
    const fobEntrada = resultado!.entrada.fobTotalUS;

    console.log(`
=== GATE COTACAO 72 (planilha×bruto) ===
FOB motor:         US$ ${sumMotor.toFixed(2)}
FOB entrada eng:   US$ ${fobEntrada.toFixed(2)}
Total BRL motor:   R$ ${totalMotor.toFixed(2)}
Alvo PDF Paulo:    R$ ${FIXTURE.totalPauloBRL.toFixed(2)}
`);

    expect(fobEntrada).toBeCloseTo(sumMotor, 0);
    expect(sumMotor).toBeGreaterThan(0);
  });
});
