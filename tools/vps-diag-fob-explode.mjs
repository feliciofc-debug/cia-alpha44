#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const row = await p.cotacao.findFirst({
  where: { cliente: { contains: process.argv[2] ?? "72", mode: "insensitive" } },
  orderBy: { atualizadoEm: "desc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) {
  console.error("not found");
  process.exit(1);
}

let sumFob = 0;
let sumEmb = 0;
let sumPlan = 0;
const linhas = [];

for (const it of row.itens) {
  const m = it.meta && typeof it.meta === "object" ? it.meta : {};
  const ft = Number(it.fobTotalUS);
  const emb = m.fobEmbarqueUS != null ? Number(m.fobEmbarqueUS) : ft;
  sumFob += ft;
  sumEmb += emb;
  const bruto = it.pesoBrutoKg != null ? Number(it.pesoBrutoKg) : 0;
  const bench = m.benchmark ?? {};
  const fobKg = bench.fobKgMedioDI ?? bench.mediaFobKg ?? null;
  const esp = fobKg && bruto > 0 ? fobKg * bruto : null;
  if (esp) sumPlan += esp;
  linhas.push({
    ordem: it.ordem,
    ncm: it.ncm,
    ncmFonte: m.ncmFonte,
    fobTotal: ft,
    fobEmbarque: emb,
    bruto,
    fobKg,
    espPlanilha: esp,
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 45),
    benchFonte: bench.fonte,
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
      sumEmbarque: sumEmb,
      sumPlanilhaXbruto: sumPlan,
      alvoPaulo: 47036,
      top8: linhas.slice(0, 8),
    },
    null,
    2,
  ),
);
