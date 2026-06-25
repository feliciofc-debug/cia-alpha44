#!/usr/bin/env node
/**
 * Remove NCM injetado por patch/legado na cotação 72 — prepara reclassificação limpa.
 * NÃO apaga confirmação humana (ncmRevisadoHumano).
 *
 * Uso na VPS:
 *   source /etc/cia-alpha44/api.env
 *   node tools/limpar-ncm-injetado-cot72.mjs [cotacaoId]
 */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const DRY_RUN = process.argv.includes("--dry-run");
const manifestPath = process.env.COT72_BACKUP_MANIFEST;
const p = new PrismaClient();

async function exigirBackup() {
  if (DRY_RUN) return;
  if (!manifestPath) {
    console.error("COT72_BACKUP_MANIFEST obrigatório antes de limpar NCM injetado.");
    process.exit(1);
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.cotacaoId !== COT_ID) {
    console.error(`Manifest é da cotação ${manifest.cotacaoId}, não ${COT_ID}.`);
    process.exit(1);
  }
  if (!manifest.sha256?.cotacaoJson || !manifest.sha256?.restoreSql) {
    console.error("Manifest sem hashes obrigatórios de backup.");
    process.exit(1);
  }
}

await exigirBackup();

const row = await p.cotacao.findUnique({
  where: { id: COT_ID },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
if (!row) {
  console.error("Cotação não encontrada:", COT_ID);
  process.exit(1);
}

let limpos = 0;
for (const it of row.itens) {
  const meta = it.meta && typeof it.meta === "object" ? { ...it.meta } : {};
  const humano = meta.ncmRevisadoHumano === true;
  const status = meta.ncmEmbarqueStatus;
  const tinhaInjetado =
    !humano &&
    status !== "coluna" &&
    (meta.ncmPlanilhaOriginal || meta.ncmEmbarque);

  if (!tinhaInjetado) continue;

  delete meta.ncmPlanilhaOriginal;
  meta.ncmEmbarque = null;
  meta.ncmEmbarqueStatus = "sem-ncm-coluna";

  if (!DRY_RUN) {
    await p.item.update({
      where: { id: it.id },
      data: { meta },
    });
  }
  console.log(`ordem ${it.ordem}: NCM injetado ${DRY_RUN ? "seria removido" : "removido"}`);
  limpos += 1;
}

console.log(`\n${DRY_RUN ? "Dry-run limpos" : "Limpos"}: ${limpos}/${row.itens.length} itens — pronto para reclassificar.`);
await p.$disconnect();
