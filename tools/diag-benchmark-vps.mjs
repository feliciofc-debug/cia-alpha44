#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import {
  buildBenchmarkIndex,
  lookupBenchmark,
  substituirHistoricoBenchmark,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  getHistoricoBenchmarkStats,
  aplicarPlanilhaChinaCotacao,
} from "../packages/pipeline/dist/index.js";

const path = process.env.BENCHMARK_PLANILHA_PATH ?? "/var/lib/cia-alpha44/benchmark-fob-kg.json";
console.log("path", path, "exists", existsSync(path));
const seed = loadBenchmarkPlanilha(path);
console.log("seed", seed ? { total: seed.total, arquivo: seed.arquivo } : null);
if (seed) substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
console.log("historico", getHistoricoBenchmarkStats());
const idx = buildBenchmarkIndex([], "ref", { planilhaPeriodo: seed?.periodoReferencia ?? null });
for (const ncm of ["84238900", "84233090", "94051190", "94052100"]) {
  const b = lookupBenchmark(idx, ncm);
  console.log(ncm, b.fonte, b.fobKgMedioDI ?? b.fobKgPonderado, b.rastroFonte);
}
const [it] = aplicarPlanilhaChinaCotacao(
  [
    {
      descOriginal: "x",
      descPt: "x",
      descDuimp: "x",
      ncm: "84238900",
      ncmCandidatos: [],
      pesoLiqKg: 10,
      fobTotalUS: 999,
      fobKgFonte: "linha",
      aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icmsEntrada: 0 },
      aliquotasOverride: false,
      anuencia: [],
      antidumping: false,
      ncmValido: true,
    },
  ],
  idx,
);
console.log("aplicado", { fobTotalUS: it.fobTotalUS, fobKgFonte: it.fobKgFonte });
