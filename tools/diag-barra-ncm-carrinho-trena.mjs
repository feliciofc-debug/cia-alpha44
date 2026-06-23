#!/usr/bin/env node
/** Dump gate vs barra — itens carrinho/trena. */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  auditarItemNcmParaPdf,
  itemPrecisaResolucaoNcm,
  itemPodeConfirmarNcmIndividual,
  itemBloqueiaPdfNcm,
} from "@cia/shared";
import { extrairItemMeta, mesclarItemMeta } from "@cia/pipeline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cotId = process.argv[2];

const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href
);

const p = new PrismaClient();
const catalog = criarNcmCatalog(loadNcmVigente());
const ctx = criarPdfNcmAuditCtx(catalog);

const where = cotId
  ? { id: cotId }
  : {
      itens: {
        some: {
          OR: [
            { descPt: { contains: "Carrinho", mode: "insensitive" } },
            { descPt: { contains: "Trena", mode: "insensitive" } },
            { descOriginal: { contains: "Carrinho", mode: "insensitive" } },
            { descOriginal: { contains: "Trena", mode: "insensitive" } },
          ],
        },
      },
    };

const rows = await p.cotacao.findMany({
  where,
  include: { itens: { orderBy: { ordem: "asc" } } },
  orderBy: { criadoEm: "desc" },
  take: cotId ? 1 : 3,
});

if (!rows.length) {
  console.error("Cotação não encontrada");
  process.exit(1);
}

const cot = rows[0];
const alvos = cot.itens.filter((i) => /carrinho|trena/i.test(i.descPt || i.descOriginal || ""));

console.log(`cotacaoId: ${cot.id} cliente: ${cot.cliente}\n`);

for (const itemRow of alvos) {
  const meta = itemRow.meta ?? {};
  const it = mesclarItemMeta(
    {
      ordem: itemRow.ordem,
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: Number(itemRow.pesoLiqKg),
      fobTotalUS: Number(itemRow.fobTotalUS),
    },
    meta,
  );
  const auditComCtx = auditarItemNcmParaPdf(it, ctx);
  const auditSemCtx = auditarItemNcmParaPdf(it);
  const dump = {
    ordem: itemRow.ordem,
    desc: (it.descPt || it.descOriginal || "").slice(0, 80),
    campos: {
      ncm: it.ncm,
      ncmValido: it.ncmValido,
      ncmConfianca: it.ncmConfianca,
      ncmFonte: it.ncmFonte,
      compatibilidadeProduto: it.compatibilidadeProduto,
      pdfNcmAudit: it.pdfNcmAudit,
    },
    auditComCtx,
    auditSemCtx,
    itemBloqueia_semCtx: itemBloqueiaPdfNcm(it),
    itemBloqueia_comCtx: itemBloqueiaPdfNcm(it, ctx),
    itemPrecisaResolucao_semCtx: itemPrecisaResolucaoNcm(it),
    itemPrecisaResolucao_comCtx: itemPrecisaResolucaoNcm(it, ctx),
    itemPodeConfirmarIndividual_semCtx: itemPodeConfirmarNcmIndividual(it),
    itemPodeConfirmarIndividual_comCtx: itemPodeConfirmarNcmIndividual(it, ctx),
    quebra:
      (itemBloqueiaPdfNcm(it) && !itemPrecisaResolucaoNcm(it)) ||
      (itemBloqueiaPdfNcm(it, ctx) && !itemPrecisaResolucaoNcm(it, ctx))
        ? "SIM — bloqueia mas não entra na barra"
        : "não",
  };
  console.log(JSON.stringify(dump, null, 2));
  console.log("---");
}

await p.$disconnect();
