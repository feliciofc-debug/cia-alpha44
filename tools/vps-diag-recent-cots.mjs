#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const rows = await p.cotacao.findMany({
  orderBy: { atualizadoEm: "desc" },
  take: 10,
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();

for (const row of rows) {
  let sum = 0;
  for (const it of row.itens) sum += Number(it.fobTotalUS);
  console.log(
    JSON.stringify({
      id: row.id,
      cliente: (row.cliente ?? "").slice(0, 50),
      totalUS: row.totalUS,
      sumFobTotalUS: sum,
      itens: row.itens.length,
      atualizado: row.atualizadoEm,
    }),
  );
}
