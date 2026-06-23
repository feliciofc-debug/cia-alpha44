#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import {
  buildBenchmarkIndex,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  defaultBenchmarkPlanilhaPath,
  substituirHistoricoBenchmark,
  fobKgSomentePlanilhaOperacional,
} from "@cia/pipeline";

const p = new PrismaClient();
const row = await p.cotacao.findFirst({
  orderBy: { atualizadoEm: "desc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) {
  console.error("no cotacao");
  process.exit(1);
}

const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
const idx = buildBenchmarkIndex([]);

let sumFob = 0;
let sumPlan = 0;
const linhas = [];

for (const it of row.itens) {
  const m = it.meta && typeof it.meta === "object" ? it.meta : {};
  const ft = Number(it.fobTotalUS ?? 0);
  sumFob += ft;
  const bruto = it.pesoBrutoKg != null ? Number(it.pesoBrutoKg) : 0;
  const bench = m.benchmark ?? {};
  const fobKg =
    bench.fobKgMedioDI ??
    bench.mediaFobKg ??
    (it.ncm ? fobKgSomentePlanilhaOperacional(idx.get?.(it.ncm.replace(/\D/g, "")) ?? null) : null);
  const ncmKey = (it.ncm ?? "").replace(/\D/g, "").padStart(8, "0");
  const bLookup = seed?.itens?.find((r) => r.ncm.replace(/\D/g, "") === ncmKey);
  const fobKgPlan = bLookup?.fobKgMedioDI ?? null;
  const esp = fobKgPlan && bruto > 0 ? fobKgPlan * bruto : null;
  if (esp) sumPlan += esp;
  linhas.push({
    ordem: it.ordem,
    ncm: it.ncm,
    ncmFonte: m.ncmFonte ?? m.classificacaoProvedor,
    fobTotal: ft,
    bruto,
    fobKgBench: fobKg,
    fobKgPlanilha: fobKgPlan,
    espPlanilhaXbruto: esp,
    benchFonte: bench.fonte,
    fobKgFonte: m.fobKgFonte,
    fobPendente: m.fobPendente ?? it.fobPendente,
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 50),
  });
}

linhas.sort((a, b) => b.fobTotal - a.fobTotal);

console.log(
  JSON.stringify(
    {
      id: row.id,
      cliente: row.cliente,
      totalUS: row.totalUS,
      itens: row.itens.length,
      sumFobTotalUS: sumFob,
      sumPlanilhaXbruto: sumPlan,
      top10: linhas.slice(0, 10),
      all: linhas,
    },
    null,
    2,
  ),
);
