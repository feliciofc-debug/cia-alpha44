#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const id = process.argv[2];
const p = new PrismaClient();
const row = await p.cotacao.findFirst({
  where: id
    ? { id }
    : { cliente: { contains: "72", mode: "insensitive" } },
  orderBy: { atualizadoEm: "desc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) {
  console.error("Cotação não encontrada");
  process.exit(1);
}

let sumFob = 0;
let sumPlanilha = 0;
const incompat = [];
const revisar = [];
const linhas = [];

for (const it of row.itens) {
  const m = it.meta && typeof it.meta === "object" ? it.meta : {};
  const compat = m.compatibilidadeProduto ?? it.compatibilidadeProduto ?? "—";
  const ft = Number(it.fobTotalUS);
  sumFob += ft;
  const bruto = it.pesoBrutoKg != null ? Number(it.pesoBrutoKg) : 0;
  const bench = m.benchmark ?? {};
  const fobKg = bench.fobKgMedioDI ?? bench.mediaFobKg ?? null;
  const esp = fobKg && bruto > 0 ? fobKg * bruto : null;
  if (esp) sumPlanilha += esp;

  const linha = {
    ordem: it.ordem,
    ncm: it.ncm,
    compat,
    motivo: (m.motivoCompatibilidade ?? it.motivoCompatibilidade ?? "").slice(0, 120),
    ncmFonte: m.ncmFonte ?? "—",
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 55),
    fobTotal: ft.toFixed(2),
    fobKg: fobKg,
    bruto,
    benchFonte: bench.fonte ?? "—",
  };
  linhas.push(linha);

  if (compat === "incompativel") incompat.push(linha);
  else if (compat === "revisar") revisar.push(linha);
}

console.log(
  JSON.stringify(
    {
      id: row.id,
      cliente: row.cliente,
      totalUS: row.totalUS,
      sumFobTotalUS: sumFob,
      sumPlanilhaXbruto: sumPlanilha,
      alvoPaulo: 47036,
      incompatCount: incompat.length,
      revisarCount: revisar.length,
      incompat,
      revisar,
    },
    null,
    2,
  ),
);
