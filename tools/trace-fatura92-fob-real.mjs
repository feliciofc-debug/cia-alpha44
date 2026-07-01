#!/usr/bin/env node
/**
 * Trace FOB veiculo no caminho real da API (montarItens -> calcularCotacao).
 *
 * Uso apos build:
 *   npm run build:api
 *   node tools/trace-fatura92-fob-real.mjs tools/fatura-92-limpa-classificar.json
 *
 * O arquivo deve ser JSON com { "linhas": [...] } (payload de /api/classificar)
 * ou { "itens": [...] } (itens ja classificados).
 */
import { readFileSync } from "node:fs";
import { getState } from "../apps/api/dist/state.js";
import { montarItens, calcularCotacao } from "../apps/api/dist/services/cotacao.js";
import { detectarPrecoCusto, lookupBenchmark } from "@cia/pipeline";
import {
  fobTotalPlanilhaItem,
  fobUsadoNoEngine,
  pesoEngineItem,
} from "../apps/api/dist/services/fob-kg-manual.js";

const file = process.argv[2] ?? "tools/fatura-92-limpa-classificar.json";
const payload = JSON.parse(readFileSync(file, "utf8"));
const state = getState();

function isVeiculoTrace(it) {
  const texto = `${it.descOriginal ?? ""} ${it.descPt ?? ""}`;
  return /patinete|scooter|hoverboard|滑板车|871160/i.test(texto) || String(it.ncm ?? "").startsWith("8711");
}

function baseCotacao(itens) {
  return {
    cliente: "trace-fatura92-fob",
    benefFiscal: "ALAGOAS",
    moeda: "US$",
    cambio: 5.0211,
    freteTotalUS: 5500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 154.23,
    antidumpingBRL: 0,
    incoterm: "CFR",
    origem: "RJ",
    destino: "SP",
    itens,
    despesas: [],
    params: {
      markupPct: 0.06,
      pisSaida: 0.0165,
      cofinsSaida: 0.076,
      icmsSaida: 0.04,
      csllSobreMarkup: 0.09,
      irrfAliq: 0.25,
      irrfBaseNotaPct: 0.027,
      ipiTetoAliqMedia: 0.15,
      icmsEntrada: 0,
    },
  };
}

const itens =
  Array.isArray(payload.linhas)
    ? (await montarItens(payload.linhas, state, { gravarCacheClassificacao: false })).itens
    : payload.itens;

if (!Array.isArray(itens)) {
  console.error("JSON invalido: esperado objeto com linhas[] ou itens[].");
  process.exit(2);
}

console.log("TRACE_INPUT", JSON.stringify({ file, itens: itens.length }));

for (const [i, it] of itens.entries()) {
  if (!isVeiculoTrace(it)) continue;
  const tipo = detectarPrecoCusto({
    descOriginal: it.descOriginal ?? "",
    descPt: it.descPt,
    ncm: it.ncm,
    uso: it.uso,
    pesoLiqKg: it.pesoLiqKg,
    pesoBrutoKg: it.pesoBrutoKg,
    qtd: it.qtd,
  });
  console.log(
    "TRACE_MONTADO",
    JSON.stringify({
      i,
      descOriginal: it.descOriginal,
      descPt: it.descPt,
      ncm: it.ncm,
      qtd: it.qtd,
      pesoLiqKg: it.pesoLiqKg,
      pesoBrutoKg: it.pesoBrutoKg,
      tipoPrecoCusto: tipo,
      fobUnitarioUS: it.fobUnitarioUS,
      fobTotalUS: it.fobTotalUS,
      fobKgFonte: it.fobKgFonte,
      fobKgAvisos: it.fobKgAvisos,
    }),
  );
}

const calc = calcularCotacao(baseCotacao(itens), state);
let sumEngine = 0;
for (const [i, it] of calc.itens.entries()) {
  const fobEngine = fobUsadoNoEngine(it, it.calibracao);
  sumEngine += fobEngine;
  if (!isVeiculoTrace(it)) continue;
  const benchmark = lookupBenchmark(state.benchmarkIndex, it.ncm || "00000000");
  console.log(
    "TRACE_CALC",
    JSON.stringify({
      i,
      descOriginal: it.descOriginal,
      ncm: it.ncm,
      qtd: it.qtd,
      pesoEngineKg: pesoEngineItem(it),
      benchmarkFonte: benchmark.fonte,
      benchmarkFobKg: benchmark.fobKgMedioDI ?? benchmark.mediaFobKg ?? benchmark.fobKgPonderado ?? null,
      fobUnitarioUS: it.fobUnitarioUS,
      fobTotalUS: it.fobTotalUS,
      fobKgFonte: it.fobKgFonte,
      fobKgAvisos: it.fobKgAvisos,
      fobTotalPlanilhaItem: fobTotalPlanilhaItem(it, benchmark),
      fobEngine,
      calibracao: it.calibracao,
    }),
  );
}

console.log(
  "TRACE_RESULT",
  JSON.stringify({
    entradaFobTotalUS: calc.resultado.entrada.fobTotalUS,
    sumEngine,
    totalBRL: calc.resultado.totalBRL,
  }),
);
