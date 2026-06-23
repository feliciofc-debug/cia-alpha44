#!/usr/bin/env node
/**
 * Trace FOB por item — Fase 0 diagnóstico.
 * Uso:
 *   node tools/trace-fob-cotacao.mjs <cotacaoId>          (requer DATABASE_URL + dist build)
 *   node tools/trace-fob-cotacao.mjs --json <arquivo.json>  (offline: { cotacao, itens })
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const pipeline = await import(pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href);
const {
  mesclarItemMeta,
  lookupBenchmark,
  resolvePesoLiqRateio,
  fobKgParaPreenchimento,
  analisarEscalaFob,
  substituirHistoricoBenchmark,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  defaultBenchmarkPlanilhaPath,
  buildBenchmarkIndex,
  loadComexSeed,
  calibrarFobKg,
} = pipeline;

try {
  const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
  if (seed?.itens?.length) substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
} catch {
  /* seed embutido */
}

const comex = loadComexSeed();
const benchmarkIndex = buildBenchmarkIndex(comex.itens, comex.contexto);

let fobUsadoNoEngine;
try {
  const mod = await import(pathToFileURL(join(root, "apps/api/dist/services/fob-kg-manual.js")).href);
  fobUsadoNoEngine = mod.fobUsadoNoEngine;
} catch {
  fobUsadoNoEngine = null;
}

const arg = process.argv[2];
const jsonMode = arg === "--json";
const cotId = jsonMode ? null : arg;
const jsonPath = jsonMode ? process.argv[3] : null;

async function loadFromDb(id) {
  const { PrismaClient } = await import("@prisma/client");
  const p = new PrismaClient();
  const row = await p.cotacao.findFirst({
    where: { OR: [{ id }, { cliente: { contains: id, mode: "insensitive" } }] },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  await p.$disconnect();
  if (!row) throw new Error(`Cotação não encontrada: ${id}`);
  return row;
}

function itemFromRow(itemRow) {
  return mesclarItemMeta(
    {
      id: itemRow.id,
      ordem: itemRow.ordem,
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: Number(itemRow.pesoLiqKg),
      pesoBrutoKg: itemRow.pesoBrutoKg != null ? Number(itemRow.pesoBrutoKg) : null,
      qtd: itemRow.qtd != null ? Number(itemRow.qtd) : null,
      fobUnitarioUS: itemRow.fobUnitarioUS != null ? Number(itemRow.fobUnitarioUS) : null,
      fobTotalUS: Number(itemRow.fobTotalUS),
      fobKgManual: itemRow.fobKgManual != null ? Number(itemRow.fobKgManual) : null,
      benchmark: itemRow.benchmark ?? undefined,
      calibracao: itemRow.calibracao ?? undefined,
      aliquotas: itemRow.aliquotas,
      aliquotasOverride: itemRow.aliquotasOverride ?? false,
      anuencia: itemRow.anuencia ?? [],
      antidumping: itemRow.antidumping ?? false,
      ncmCandidatos: itemRow.ncmCandidatos ?? [],
    },
    itemRow.meta,
  );
}

function traceItem(it) {
  const benchmark = lookupBenchmark(benchmarkIndex, it.ncm || "00000000");
  const pesoRateio = resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
  const fobKgPlanilha = fobKgParaPreenchimento(benchmark);
  const analise = analisarEscalaFob({
    ncm: it.ncm,
    pesoLiqKg: it.pesoLiqKg,
    pesoBrutoKg: it.pesoBrutoKg,
    fobTotalUS: it.fobTotalUS,
    fobKgPlanilha,
  });

  const calibracao =
    it.calibracao ??
    calibrarFobKg({
      fobKgOriginal: fobKgPlanilha,
      benchmark,
      fobTotalUS: it.fobTotalUS,
      pesoLiqKg: pesoRateio,
      fobKgFonte: it.fobKgFonte,
    });

  const engineFob = fobUsadoNoEngine ? fobUsadoNoEngine({ ...it, benchmark }, calibracao) : null;

  return {
    ordem: it.ordem,
    ncm: it.ncm,
    desc: (it.descPt || it.descOriginal || "").slice(0, 60),
    pesoLiqKg: it.pesoLiqKg,
    pesoBrutoKg: it.pesoBrutoKg,
    qtd: it.qtd,
    pesoRateio,
    fobTotalUS: it.fobTotalUS,
    fobEmbarqueUS: it.fobEmbarqueUS ?? null,
    fobKgMedioDI: benchmark.fobKgMedioDI ?? benchmark.mediaFobKg ?? null,
    benchmarkFonte: benchmark.fonte,
    fobEsperadoPlanilha: analise.fobEsperadoPlanilha,
    ratio: analise.ratio,
    fobUsadoNoEngine: engineFob,
    pesoImplicito: analise.pesoImplicito,
    flags: analise.flags,
    classificacao:
      analise.flags.includes("peso_absurdo") || analise.flags.includes("ncm_suspeito")
        ? "LINHA_LIXO_ESCALA"
        : analise.flags.includes("ratio_corrupcao")
          ? "FOB_PERSISTIDO_CORROMPIDO"
          : analise.ratio != null && analise.ratio > 50
            ? "ESCALA_SUSPEITA"
            : "OK",
  };
}

let label;
let itens;

if (jsonMode) {
  if (!jsonPath) {
    console.error("Uso: node tools/trace-fob-cotacao.mjs --json <arquivo.json>");
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  label = data.label ?? jsonPath;
  itens = (data.itens ?? data.cotacao?.itens ?? []).map((it, i) => ({
    ...it,
    ordem: it.ordem ?? i,
  }));
} else if (cotId) {
  const row = await loadFromDb(cotId);
  label = `${row.id} (${row.cliente})`;
  itens = row.itens.map(itemFromRow);
} else {
  console.error("Uso: node tools/trace-fob-cotacao.mjs <cotacaoId>");
  console.error("     node tools/trace-fob-cotacao.mjs --json <arquivo.json>");
  process.exit(2);
}

const traces = itens.map(traceItem);
const anomalias = traces.filter((t) => t.flags.length > 0 || (t.ratio != null && t.ratio > 50));

console.log("=== TRACE FOB — FASE 0 ===");
console.log(`Cotação: ${label}`);
console.log(`Itens: ${traces.length}`);
console.log("");

let sumInvoice = 0;
let sumPlanilha = 0;
for (const t of traces) {
  sumInvoice += t.fobEmbarqueUS ?? t.fobTotalUS ?? 0;
  sumPlanilha += t.fobEsperadoPlanilha ?? 0;
  console.log(JSON.stringify(t, null, 0));
}

console.log("");
console.log("--- RESUMO ---");
console.log(`Σ FOB invoice/embarque:  US$ ${sumInvoice.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Σ FOB planilha×peso:     US$ ${sumPlanilha.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
if (sumInvoice > 0) {
  const delta = ((sumPlanilha - sumInvoice) / sumInvoice) * 100;
  console.log(`Δ planilha vs invoice:   ${delta.toFixed(1)}%`);
}
console.log(`Anomalias (peso/ratio/ncm): ${anomalias.length}`);
for (const a of anomalias) {
  console.log(`  → ordem ${a.ordem} NCM ${a.ncm}: ${a.classificacao} flags=[${a.flags.join(",")}] ratio=${a.ratio?.toFixed(1) ?? "—"}`);
}
