#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";

const COT = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const p = new PrismaClient();
const row = await p.cotacao.findUnique({
  where: { id: COT },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
if (!row) throw new Error("not found");
for (const it of row.itens) {
  console.log(
    JSON.stringify({
      ordem: it.ordem,
      ncm: it.ncm,
      desc: it.descOriginal?.slice(0, 35),
      pesoBrutoKg: Number(it.pesoBrutoKg),
      pesoLiqKg: Number(it.pesoLiqKg),
      qtd: it.qtd != null ? Number(it.qtd) : null,
      fobTotalUS: Number(it.fobTotalUS),
      fobEmbarqueUS: it.meta?.fobEmbarqueUS ?? null,
      meta: it.meta,
    }),
  );
}
