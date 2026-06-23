#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const row = await p.cotacao.findFirst({
  where: {
    OR: [
      { id: process.argv[2] },
      { cliente: { contains: process.argv[2] ?? "72", mode: "insensitive" } },
    ],
  },
  orderBy: { atualizadoEm: "desc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) {
  console.error("Cotação não encontrada");
  process.exit(1);
}

let embarque = 0;
let fobTotal = 0;
let planilhaBruto = 0;
const linhas = [];

for (const it of row.itens) {
  const meta = it.meta && typeof it.meta === "object" ? it.meta : {};
  const emb = meta.fobEmbarqueUS != null ? Number(meta.fobEmbarqueUS) : Number(it.fobTotalUS);
  const ft = Number(it.fobTotalUS);
  embarque += emb;
  fobTotal += ft;
  const bruto = it.pesoBrutoKg != null ? Number(it.pesoBrutoKg) : 0;
  const liq = Number(it.pesoLiqKg);
  const fobKg = it.fobKgManual != null ? Number(it.fobKgManual) : null;
  const bench = meta.benchmark ?? it.benchmark;
  const fobKgPlan = bench?.fobKgMedioDI ?? bench?.mediaFobKg ?? fobKg;
  const espBruto = fobKgPlan && bruto > 0 ? fobKgPlan * bruto : null;
  if (espBruto) planilhaBruto += espBruto;
  linhas.push({
    ordem: it.ordem,
    ncm: it.ncm,
    emb: emb.toFixed(2),
    fobTotal: ft.toFixed(2),
    bruto,
    liq,
    fobKgPlan,
    espBruto: espBruto?.toFixed(2) ?? null,
    ncmFonte: meta.ncmFonte,
  });
}

console.log(
  JSON.stringify(
    {
      id: row.id,
      cliente: row.cliente,
      itens: row.itens.length,
      totalUS_cotacao: row.totalUS,
      sumEmbarque: embarque,
      sumFobTotalUS: fobTotal,
      sumPlanilhaFobKgXbruto: planilhaBruto,
      alvoPaulo: 47036,
      git: "679ab15 era invoice motor",
    },
    null,
    2,
  ),
);
console.log("\n--- primeiros 5 itens ---");
for (const l of linhas.slice(0, 5)) console.log(l);
console.log("\n--- maiores gaps emb vs planilha×bruto ---");
for (const l of linhas
  .map((l) => ({
    ...l,
    gap: l.espBruto ? Number(l.fobTotal) - Number(l.espBruto) : null,
  }))
  .filter((l) => l.gap != null)
  .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0))
  .slice(0, 8)) {
  console.log(l);
}
