#!/usr/bin/env node
/**
 * Recomputa compatibilidadeProduto dos itens de uma cotação salva (meta persistida).
 * Uso VPS: source /etc/cia-alpha44/api.env && node tools/reclassificar-compat-cotacao.mjs <cotacaoId>
 */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { extrairItemMeta, mesclarItemMeta } from "@cia/pipeline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cotId = process.argv[2];
if (!cotId) {
  console.error("Uso: node tools/reclassificar-compat-cotacao.mjs <cotacaoId>");
  process.exit(2);
}

const { getState } = await import(pathToFileURL(join(root, "apps/api/dist/state.js")).href);
const { avaliarCompatibilidadeProduto } = await import(
  pathToFileURL(join(root, "apps/api/dist/siscomex/compatibilidade-produto.js")).href
);
const { validarNcmItem } = await import(pathToFileURL(join(root, "packages/pipeline/dist/classificar-ncm.js")).href);

const state = getState();
const prisma = new PrismaClient();
const row = await prisma.cotacao.findUnique({
  where: { id: cotId },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
if (!row) {
  console.error("Cotação não encontrada");
  process.exit(1);
}

console.log(`Reclassificando compatibilidade: ${cotId} (${row.itens.length} itens)\n`);

for (const itemRow of row.itens) {
  const metaAtual = itemRow.meta ?? {};
  const base = mesclarItemMeta(
    {
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: Number(itemRow.pesoLiqKg),
      fobTotalUS: Number(itemRow.fobTotalUS),
    },
    metaAtual,
  );
  const descricao = (base.descOriginal || base.descPt || "").trim();
  const { resultado: comp } = avaliarCompatibilidadeProduto(state.ncmCatalog, {
    descricao,
    descricaoFamilia: itemRow.descOriginal,
    material: base.material,
    ncm: itemRow.ncm,
    familiaId: base.familiaProdutoId,
  });
  const validacao = validarNcmItem(
    itemRow.ncm,
    descricao,
    state.ncmCatalog,
    base.ncmFonte ?? "ia",
    base.uso,
  );
  const antes = metaAtual.compatibilidadeProduto ?? "(ausente)";
  const novoMeta = extrairItemMeta({
    ...base,
    compatibilidadeProduto: comp.compatibilidadeProduto,
    motivoCompatibilidade: comp.motivoCompatibilidade,
    familiaProdutoId: validacao.familia?.id ?? base.familiaProdutoId,
    ncmValido: validacao.ok,
    ncmAvisos: validacao.avisos.length ? validacao.avisos : base.ncmAvisos,
  });
  await prisma.item.update({
    where: { id: itemRow.id },
    data: { meta: novoMeta },
  });
  const nome = (itemRow.descPt || itemRow.descOriginal || "").slice(0, 48);
  if (/filtro/i.test(nome) || antes !== comp.compatibilidadeProduto) {
    console.log(
      `[${itemRow.ordem}] ${nome}\n  antes: ${antes} → depois: ${comp.compatibilidadeProduto} | ncmValido: ${validacao.ok} | familia: ${validacao.familia?.id ?? "?"}`,
    );
  }
}

await prisma.$disconnect();
console.log("\nOK — meta atualizada. Rode GET /pdf para validar.");
