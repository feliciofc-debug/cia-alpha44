/**
 * Gate cotação 92 — metodologia empresa: FOB DI = planilha FOB/kg × peso bruto.
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
  pesoBrutoPlanilhaFob,
  lookupBenchmark,
  criarNcmCatalog,
  loadNcmVigenteCache,
} from "@cia/pipeline";
import { calcularCotacao } from "../src/services/cotacao.js";
import { fobUsadoNoEngine } from "../src/services/fob-kg-manual.js";
import type { AppState } from "../src/state.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(join(__dir, "../../../tools/fixtures/cotacao-92-itens.json"), "utf8"),
) as {
  params: Record<string, number | string>;
  despesas: Array<{ nome: string; valorBRL: number; entraBaseNota?: boolean }>;
  totalPauloBRL: number;
  itens: Item[];
  _meta?: { FOB_DI_oficial_US?: number; nota_ipi_saida?: string };
};

function carregarBenchmarkChina() {
  try {
    const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
    if (seed?.itens.length) substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  } catch {
    substituirHistoricoBenchmark([]);
  }
}

describe("gate cotação 92 — metodologia planilha×bruto vs planilha Paulo", () => {
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

  it("total BRL dentro de ±2% de R$ 447.451 com FOB planilha×bruto", () => {
    const itens = FIXTURE.itens as Item[];
    let sumMotor = 0;
    let sumMetodologia = 0;

    const destino = String(FIXTURE.params.destino ?? "MG");
    const cotacao = {
      cambio: FIXTURE.params.cambio as number,
      freteTotalUS: FIXTURE.params.freteTotalUS as number,
      adicionaisVaUS: (FIXTURE.params.adicionaisVaUS as number) ?? 0,
      reducaoBaseUS: (FIXTURE.params.reducaoBaseUS as number) ?? 0,
      siscomex: FIXTURE.params.siscomex as number,
      antidumpingBRL: 0,
      cliente: "Paulo — gate 92",
      benefFiscal: "NENHUM" as const,
      moeda: "USD" as const,
      incoterm: "FOB",
      origem: "CN",
      destino,
      ufEmpresa: String(FIXTURE.params.ufEmpresa ?? "AL"),
      despesas: FIXTURE.despesas,
      outrasDespesasBaseBRL: FIXTURE.params.outrasDespesasBaseBRL as number,
      params: {
        ...PARAMS_SAIDA_PADRAO,
        markupPct: (FIXTURE.params.markupPct as number) ?? 0.04,
      },
      itens,
    };

    const { resultado, itens: itensCalc } = calcularCotacao(cotacao, state);
    expect(resultado).not.toBeNull();

    for (const it of itensCalc) {
      const bench = lookupBenchmark(state.benchmarkIndex, it.ncm);
      const bruto = pesoBrutoPlanilhaFob(it) || it.pesoLiqKg;
      sumMotor += fobUsadoNoEngine(it, it.calibracao!);
      sumMetodologia += fobTotalPlanilhaPeso(bruto, bench, it.fobKgManual);
    }

    const r = resultado!;
    const totalMotor = r.totalBRL;
    const desvioPauloPct = ((totalMotor - FIXTURE.totalPauloBRL) / FIXTURE.totalPauloBRL) * 100;

    console.log(`
=== GATE COTACAO 92 (planilha×bruto) ===
Destino:               ${destino} (Plan1 — transporte/escolta)
FOB motor:             US$ ${sumMotor.toFixed(2)}
FOB metodologia ref:   US$ ${sumMetodologia.toFixed(2)}
--- rubricas motor ---
FOB DI:                US$ ${r.entrada.fobTotalUS.toFixed(2)}
II:                    R$ ${r.entrada.iiTotal.toFixed(2)}
IPI:                   R$ ${r.entrada.ipiTotal.toFixed(2)}
PIS+COFINS:            R$ ${(r.entrada.pisTotal + r.entrada.cofinsTotal).toFixed(2)}
Taxas locais:          R$ ${r.saida.taxasLocaisTotalBRL.toFixed(2)}
DIF IPI:               R$ ${r.saida.difIPI.toFixed(2)}
ICMS saída:            R$ ${r.saida.icmsSaida.toFixed(2)}
Markup:                R$ ${r.saida.markup.toFixed(2)}
Total BRL motor:       R$ ${totalMotor.toFixed(2)}
Total BRL Paulo:       R$ ${FIXTURE.totalPauloBRL.toFixed(2)}
Desvio vs Paulo:       ${desvioPauloPct.toFixed(2)}%
`);

    expect(sumMotor).toBeCloseTo(sumMetodologia, 0);
    expect(r.entrada.fobTotalUS).toBeCloseTo(sumMotor, 0);
  });
});
