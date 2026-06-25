#!/usr/bin/env node
/**
 * Backup obrigatório antes de reclassificar a cotação 72 em produção.
 *
 * Gera:
 * - cotacao.json: snapshot Prisma da cotação + itens + despesas.
 * - restore.sql: SQL restaurável da Cotacao + Item + Despesa da cotação alvo.
 * - tenant-cotacoes-before.json: updatedAt/totais das demais cotações do tenant.
 * - manifest.json: caminhos + hashes SHA-256.
 *
 * Uso:
 *   source /etc/cia-alpha44/api.env
 *   COT72_TENANT_SLUG=user_user_... \
 *   node tools/backup-cot72-producao.mjs cmqlfuhvm000ykw2cue1whldj /tmp/cot72-backup
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const outDir = resolve(process.argv[3] ?? process.env.COT72_BACKUP_DIR ?? `/tmp/cot72-backup-${Date.now()}`);
const printManifestOnly = process.argv.includes("--print-manifest");
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT_REF = process.env.COT72_TENANT_SLUG ?? process.env.COT72_TENANT_ID ?? (tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : undefined);
const p = new PrismaClient();

function jsonStable(value) {
  return JSON.stringify(
    value,
    (_key, v) => {
      if (v instanceof Date) return v.toISOString();
      if (v && typeof v === "object" && typeof v.toString === "function" && v.constructor?.name === "Decimal") {
        return v.toString();
      }
      return v;
    },
    2,
  );
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

async function hashFile(path) {
  return sha256(await readFile(path));
}

function qIdent(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function qString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function qJson(value) {
  if (value == null) return "NULL";
  return `${qString(JSON.stringify(value))}::jsonb`;
}

function qValue(value, kind = "text") {
  if (value == null) return "NULL";
  if (value instanceof Date) return qString(value.toISOString());
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (kind === "json") return qJson(value);
  if (kind === "number") return String(value);
  if (value && typeof value === "object" && typeof value.toString === "function" && value.constructor?.name === "Decimal") {
    return value.toString();
  }
  return qString(value);
}

function insertSql(table, columns, row) {
  const names = columns.map(([name]) => qIdent(name)).join(", ");
  const values = columns.map(([name, kind]) => qValue(row[name], kind)).join(", ");
  return `INSERT INTO ${qIdent(table)} (${names}) VALUES (${values});`;
}

function restoreSql(row) {
  const cotacaoCols = [
    ["id"], ["tenantId"], ["empresaTrade"], ["cliente"], ["benefFiscal"], ["moeda"],
    ["moedaPlanilha"], ["cambioEurUsd", "number"], ["cambioEurUsdData"], ["cambioEurUsdFonte"],
    ["cambio", "number"], ["freteTotalUS", "number"], ["adicionaisVaUS", "number"],
    ["reducaoBaseUS", "number"], ["siscomex", "number"], ["antidumpingBRL", "number"],
    ["incoterm"], ["origem"], ["destino"], ["ufEmpresa"], ["regimeIcms"],
    ["icmsSaidaManualFlag"], ["avisosFiscais", "json"], ["outrasDespesasBaseBRL", "number"],
    ["params", "json"], ["status"], ["totalBRL", "number"], ["totalUS", "number"],
    ["canalPredominante"], ["resultadoCalculo", "json"], ["calculadoEm"], ["criadoEm"], ["atualizadoEm"],
  ];
  const itemCols = [
    ["id"], ["cotacaoId"], ["ordem", "number"], ["descOriginal"], ["descPt"], ["descDuimp"],
    ["ncm"], ["ncmCandidatos", "json"], ["pesoBrutoKg", "number"], ["pesoLiqKg", "number"],
    ["qtd", "number"], ["fobUnitarioUS", "number"], ["fobTotalUS", "number"],
    ["fobKgManual", "number"], ["aliquotas", "json"], ["aliquotasOverride"],
    ["benchmark", "json"], ["calibracao", "json"], ["risco", "json"], ["anuencia", "json"],
    ["antidumping"], ["fotoPath"], ["meta", "json"],
  ];
  const despesaCols = [
    ["id"], ["cotacaoId"], ["ordem", "number"], ["nome"], ["valorBRL", "number"],
    ["entraBaseSaida"], ["entraBaseNota"],
  ];

  const lines = [
    "-- Backup restaurável da cotação 72. Revisar antes de executar em produção.",
    "BEGIN;",
    `DELETE FROM ${qIdent("Cotacao")} WHERE ${qIdent("id")} = ${qString(row.id)};`,
    insertSql("Cotacao", cotacaoCols, row),
    ...[...row.itens].sort((a, b) => a.ordem - b.ordem).map((it) => insertSql("Item", itemCols, it)),
    ...[...row.despesas].sort((a, b) => a.ordem - b.ordem).map((d) => insertSql("Despesa", despesaCols, d)),
    "COMMIT;",
    "",
  ];
  return lines.join("\n");
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
  const tenant = await resolverTenant(TENANT_REF);
  const row = await p.cotacao.findFirst({
    where: {
      id: COT_ID,
      ...(tenant ? { tenantId: tenant.id } : {}),
    },
    include: {
      tenant: true,
      itens: { orderBy: { ordem: "asc" } },
      despesas: { orderBy: { ordem: "asc" } },
    },
  });
  if (row) return row;

  const qualquerTenant = await p.cotacao.findUnique({
    where: { id: COT_ID },
    include: { tenant: true },
  });
  if (qualquerTenant && tenant) {
    throw new Error(
      `Cotação ${COT_ID} existe, mas no tenant ${qualquerTenant.tenant.slug}; tenant solicitado: ${tenant.slug}.`,
    );
  }

  const recentes = tenant
    ? await p.cotacao.findMany({
        where: { tenantId: tenant.id },
        orderBy: { criadoEm: "desc" },
        take: 5,
        select: { id: true, cliente: true },
      })
    : [];
  const dica = recentes.length
    ? ` Últimas cotações do tenant ${tenant?.slug}: ${recentes.map((r) => `${r.id} (${r.cliente})`).join("; ")}`
    : "";
  throw new Error(`Cotação não encontrada: ${COT_ID}${tenant ? ` no tenant ${tenant.slug}` : ""}.${dica}`);
}

async function main() {
  const row = await buscarCotacaoAlvo();

  await mkdir(outDir, { recursive: true });
  const manifestPath = join(outDir, "manifest.json");
  if (existsSync(manifestPath)) {
    console.error(`Backup já existe, recusando sobrescrever: ${manifestPath}`);
    process.exit(1);
  }

  const tenantCotacoes = await p.cotacao.findMany({
    where: { tenantId: row.tenantId },
    orderBy: { criadoEm: "asc" },
    select: { id: true, atualizadoEm: true, totalUS: true, totalBRL: true, cliente: true },
  });

  const jsonPath = join(outDir, "cotacao.json");
  const sqlPath = join(outDir, "restore.sql");
  const tenantPath = join(outDir, "tenant-cotacoes-before.json");

  await writeFile(jsonPath, `${jsonStable(row)}\n`);
  await writeFile(sqlPath, restoreSql(row));
  await writeFile(tenantPath, `${jsonStable(tenantCotacoes)}\n`);

  const manifest = {
    tipo: "backup-cot72-producao",
    cotacaoId: row.id,
    tenantId: row.tenantId,
    tenantSlug: row.tenant.slug,
    criadoEm: new Date().toISOString(),
    paths: {
      dir: outDir,
      cotacaoJson: jsonPath,
      restoreSql: sqlPath,
      tenantCotacoesBefore: tenantPath,
    },
    counts: {
      itens: row.itens.length,
      despesas: row.despesas.length,
      cotacoesTenant: tenantCotacoes.length,
    },
    sha256: {
      cotacaoJson: await hashFile(jsonPath),
      restoreSql: await hashFile(sqlPath),
      tenantCotacoesBefore: await hashFile(tenantPath),
    },
  };
  await writeFile(manifestPath, `${jsonStable(manifest)}\n`);

  if (printManifestOnly) {
    console.log(manifestPath);
  } else {
    console.error(`Backup cot 72 criado em: ${outDir}`);
    console.error(`Manifest: ${manifestPath}`);
    console.error(`SHA JSON: ${manifest.sha256.cotacaoJson}`);
    console.error(`SHA SQL:  ${manifest.sha256.restoreSql}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await p.$disconnect();
  });
