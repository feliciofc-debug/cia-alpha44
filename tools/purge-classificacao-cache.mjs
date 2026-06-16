#!/usr/bin/env node
/**
 * Purga entradas do cache de classificação NCM por SKU/texto na descrição.
 *
 * Uso:
 *   DATABASE_URL=... node tools/purge-classificacao-cache.mjs MOT-EL-3000
 *   DATABASE_URL=... node tools/purge-classificacao-cache.mjs --dry-run MOT-EL
 *
 * Requer @prisma/client (rodar na VPS: cd /opt/cia-alpha44 && source /etc/cia-alpha44/api.env)
 */
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const termos = args.filter((a) => a !== "--dry-run");

if (!termos.length) {
  console.error("Uso: node tools/purge-classificacao-cache.mjs [--dry-run] <SKU ou texto>");
  process.exit(2);
}
if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL ausente.");
  process.exit(2);
}

const prisma = new PrismaClient();
const needle = termos.join(" ").toLowerCase();

try {
  const rows = await prisma.classificacaoCache.findMany({ orderBy: { updatedAt: "desc" } });
  const hits = rows.filter((r) => {
    const blob = JSON.stringify(r.resultado ?? {}).toLowerCase();
    return blob.includes(needle);
  });

  console.log(`Termo: "${termos.join(" ")}" | matches: ${hits.length}${dryRun ? " (dry-run)" : ""}`);
  for (const r of hits) {
    const ncm = (r.resultado)?.ncmCandidatos?.[0]?.ncm;
    console.log(
      `  ncm=${ncm ?? "?"} humano=${r.confirmadoHumano} hits=${r.hitCount} chave=${r.chave.slice(0, 12)}…`,
    );
    if (!dryRun) {
      await prisma.classificacaoCache.delete({ where: { chave: r.chave } });
      console.log("    deleted");
    }
  }
} finally {
  await prisma.$disconnect();
}
