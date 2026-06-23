#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const id = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) throw new Error("not found");

const byFonte = {};
for (const it of row.itens) {
  const m = it.meta && typeof it.meta === "object" ? it.meta : {};
  const f = m.ncmFonte ?? "—";
  byFonte[f] = (byFonte[f] ?? 0) + 1;
}

console.log(JSON.stringify({ git: "run on vps separately", totalUS: row.totalUS, byFonte, itens: row.itens.length }, null, 2));
