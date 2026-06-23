#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id: process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
let bruto = 0;
for (const it of row?.itens ?? []) {
  const m = it.meta && typeof it.meta === "object" ? it.meta : {};
  console.log(
    [it.ordem, it.ncm, m.ncmPlanilhaOriginal ?? "-", Number(it.pesoBrutoKg).toFixed(1), it.descOriginal?.slice(0, 50)].join("\t"),
  );
  bruto += Number(it.pesoBrutoKg ?? 0);
}
console.log("SUM bruto DB", bruto.toFixed(1));
await p.$disconnect();
