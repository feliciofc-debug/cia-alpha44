#!/usr/bin/env node
/** Prova barra de resolução — carrinho + trena (sim-china). */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  itensResolucaoNcm,
  mesclarItensInvalidosPdfAudit,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itemPodeConfirmarNcmIndividual,
} from "@cia/shared";
import { extrairItemMeta, mesclarItemMeta } from "@cia/pipeline";
import { PrismaClient } from "@prisma/client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const COT = process.argv[2] ?? "cmqgy89om000ykwaz7cd24o0a";

const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente, enriquecerItensPdfNcmAudit } =
  await import(pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href);

const p = new PrismaClient();
const ctx = criarPdfNcmAuditCtx(criarNcmCatalog(loadNcmVigente()));
const row = await p.cotacao.findUnique({
  where: { id: COT },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();

const itens = enriquecerItensPdfNcmAudit(
  row.itens.map((itemRow) =>
    mesclarItemMeta(
      {
        ordem: itemRow.ordem,
        descOriginal: itemRow.descOriginal,
        descPt: itemRow.descPt,
        descDuimp: itemRow.descDuimp,
        ncm: itemRow.ncm,
        pesoLiqKg: Number(itemRow.pesoLiqKg),
        fobTotalUS: Number(itemRow.fobTotalUS),
      },
      itemRow.meta ?? {},
    ),
  ),
  ctx,
);

const barra = itensResolucaoNcm(itens).filter(({ item }) => /carrinho|trena/i.test(item.descPt || item.descOriginal || ""));
console.log("=== BARRA (carrinho + trena) ===");
for (const { ordem, item } of barra) {
  const nome = (item.descPt || item.descOriginal || "").slice(0, 60);
  const motivo = item.pdfNcmAudit?.motivo?.slice(0, 80) ?? "";
  console.log(
    `- #${ordem} ${nome} | bloqueia=${itemBloqueiaPdfNcm(item)} | resolucao=${itemPrecisaResolucaoNcm(item)} | confirmar=${itemPodeConfirmarNcmIndividual(item)} | ${motivo}`,
  );
}
console.log(`\nTotal na barra (carrinho+trena): ${barra.length} (esperado: 2)`);
process.exit(barra.length === 2 ? 0 : 1);
