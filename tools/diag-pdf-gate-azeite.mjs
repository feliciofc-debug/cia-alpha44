#!/usr/bin/env node
/** PASSO 1 — compara gate front vs back para item azeite. */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { itemBloqueiaPdfNcm, auditarItemNcmParaPdf } from "@cia/shared";
import { extrairItemMeta, mesclarItemMeta, criarPdfNcmAuditCtx } from "@cia/pipeline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { criarNcmCatalog, loadNcmVigente, validarNcmItem } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href
);

const p = new PrismaClient();
const catalog = criarNcmCatalog(loadNcmVigente());

const rows = await p.cotacao.findMany({
  where: {
    itens: {
      some: {
        OR: [
          { descPt: { contains: "Azeite", mode: "insensitive" } },
          { descOriginal: { contains: "Azeite", mode: "insensitive" } },
          { descPt: { contains: "olive", mode: "insensitive" } },
          { ncm: { contains: "15092000" } },
        ],
      },
    },
  },
  include: { itens: { orderBy: { ordem: "asc" } } },
  orderBy: { criadoEm: "desc" },
  take: 5,
});

if (!rows.length) {
  console.error("Nenhuma cotação com azeite encontrada");
  process.exit(1);
}

const cot = rows[0];
const itemRow = cot.itens.find(
  (i) =>
    /azeite|olive/i.test(i.descPt || i.descOriginal || "") ||
    (i.ncm ?? "").replace(/\D/g, "").startsWith("15092000"),
);

if (!itemRow) {
  console.error("Item azeite não encontrado na cotação", cot.id);
  process.exit(1);
}

const meta = itemRow.meta ?? {};
const it = mesclarItemMeta(
  {
    descOriginal: itemRow.descOriginal,
    descPt: itemRow.descPt,
    descDuimp: itemRow.descDuimp,
    ncm: itemRow.ncm,
    pesoLiqKg: Number(itemRow.pesoLiqKg),
    fobTotalUS: Number(itemRow.fobTotalUS),
    ordem: itemRow.ordem,
  },
  meta,
);

const desc = (it.descPt || it.descOriginal || "").trim();
const ncm8 = (it.ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
const ctx = criarPdfNcmAuditCtx(catalog);
const frontBloqueia = itemBloqueiaPdfNcm(it, ctx);
const audit = auditarItemNcmParaPdf(it, ctx);
const catalogExiste = catalog.existe(ncm8);
const validacao = validarNcmItem(ncm8, desc, catalog, it.ncmFonte ?? "ia");

console.log(
  JSON.stringify(
    {
      cotacaoId: cot.id,
      cliente: cot.cliente,
      ordem: itemRow.ordem,
      campos: {
        ncm: it.ncm,
        ncmValido: it.ncmValido,
        ncmConfianca: it.ncmConfianca,
        ncmFonte: it.ncmFonte,
        compatibilidadeProduto: it.compatibilidadeProduto,
        ncmRevisadoHumano: it.ncmRevisadoHumano,
        ncmConfirmado: it.ncmConfirmado,
      },
      desc: desc.slice(0, 120),
      gates: {
        front_itemBloqueiaPdfNcm: frontBloqueia,
        audit_bloqueia: audit.bloqueia,
        audit_motivo: audit.motivo,
        back_catalog_existe: catalogExiste,
        back_validarNcmItem_ok: validacao.ok,
        back_validarNcmItem_avisos: validacao.avisos,
        front_back_concordam: frontBloqueia === audit.bloqueia,
      },
    },
    null,
    2,
  ),
);

await p.$disconnect();
