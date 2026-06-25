#!/usr/bin/env node
/**
 * Remove NCM injetado por patch/legado na cotação 72 — prepara reclassificação limpa.
 * NÃO apaga confirmação humana (ncmRevisadoHumano).
 *
 * Uso na VPS:
 *   source /etc/cia-alpha44/api.env
 *   COT72_TENANT_SLUG=user_user_... \
 *   node tools/limpar-ncm-injetado-cot72.mjs [cotacaoId]
 */
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";

const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const DRY_RUN = process.argv.includes("--dry-run");
const manifestPath = process.env.COT72_BACKUP_MANIFEST;
const tenantArgIdx = process.argv.indexOf("--tenant");
let tenantRef = process.env.COT72_TENANT_SLUG ?? process.env.COT72_TENANT_ID ?? (tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : undefined);
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
  tenantRef = tenantRef ?? manifest.tenantSlug ?? manifest.tenantId;
  return manifest;
}

async function resolverTenant(ref) {
  if (!ref?.trim()) return null;
  const tenant = await p.tenant.findFirst({
    where: { OR: [{ id: ref.trim() }, { slug: ref.trim() }] },
  });
  if (!tenant) {
    throw new Error(`Tenant não encontrado: ${ref}`);
  }
  return tenant;
}

async function buscarCotacaoAlvo() {
  const tenant = await resolverTenant(tenantRef);
  const row = await p.cotacao.findFirst({
    where: {
      id: COT_ID,
      ...(tenant ? { tenantId: tenant.id } : {}),
    },
    include: { tenant: true, itens: { orderBy: { ordem: "asc" } } },
  });
  if (row) return row;

  const qualquerTenant = await p.cotacao.findUnique({ where: { id: COT_ID }, include: { tenant: true } });
  if (qualquerTenant && tenant) {
    throw new Error(`Cotação ${COT_ID} existe, mas no tenant ${qualquerTenant.tenant.slug}; tenant solicitado: ${tenant.slug}.`);
  }
  throw new Error(`Cotação não encontrada: ${COT_ID}${tenant ? ` no tenant ${tenant.slug}` : ""}.`);
}

await exigirBackup();
const row = await buscarCotacaoAlvo();

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
