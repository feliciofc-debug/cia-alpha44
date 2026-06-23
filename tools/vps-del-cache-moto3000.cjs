#!/usr/bin/env node
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  const all = await p.classificacaoCache.findMany({ take: 2000, orderBy: { updatedAt: "desc" } });
  const hits = all.filter((r) => {
    const s = JSON.stringify(r.resultado ?? {});
    return s.includes("MOT-EL-3000") || s.includes("3000W");
  });
  console.log("matches", hits.length);
  for (const r of hits) {
    console.log("ncm", r.resultado?.ncmCandidatos?.[0]?.ncm, "humano", r.confirmadoHumano, "hits", r.hitCount, "chave", r.chave.slice(0, 12));
    await p.classificacaoCache.delete({ where: { chave: r.chave } });
    console.log("deleted");
  }
  await p.$disconnect();
})();
