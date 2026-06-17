#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const rows = await p.item.findMany({
  where: {
    OR: [
      { ncm: "22083020" },
      { ncm: "09023000" },
      { descPt: { contains: "Whisky", mode: "insensitive" } },
      { descPt: { contains: "UK-BEV", mode: "insensitive" } },
    ],
  },
  include: { cotacao: { select: { id: true, cliente: true } } },
  orderBy: { cotacao: { criadoEm: "desc" } },
  take: 5,
});
console.log(JSON.stringify(rows.map((i) => ({
  cotId: i.cotacao.id,
  cliente: i.cotacao.cliente,
  ordem: i.ordem,
  ncm: i.ncm,
  desc: i.descPt?.slice(0, 60),
  meta: i.meta,
})), null, 2));
await p.$disconnect();
