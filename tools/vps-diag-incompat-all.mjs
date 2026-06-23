#!/usr/bin/env node
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");
const { criarNcmCatalog, loadNcmVigenteCache, mesclarItemMeta } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);
const { avaliarCompatibilidadeProduto } = await import(
  pathToFileURL(join(root, "apps/api/dist/siscomex/compatibilidade-produto.js")).href,
);

const p = new PrismaClient();
const row = await p.cotacao.findFirst({
  where: { cliente: { contains: "72", mode: "insensitive" } },
  orderBy: { atualizadoEm: "desc" },
  include: { itens: { orderBy: { ordem: "asc" } } },
});
await p.$disconnect();
const catalog = criarNcmCatalog(loadNcmVigenteCache());

const all = [];
for (const itemRow of row.itens) {
  const it = mesclarItemMeta(
    { descOriginal: itemRow.descOriginal, descPt: itemRow.descPt, ncm: itemRow.ncm },
    itemRow.meta,
  );
  const { resultado } = avaliarCompatibilidadeProduto(catalog, {
    descricao: `${it.descOriginal} ${it.descPt ?? ""}`,
    ncm: it.ncm,
  });
  all.push({
    ordem: itemRow.ordem,
    ncm: it.ncm,
    compat: resultado.compatibilidadeProduto,
    motivo: resultado.motivoCompatibilidade?.slice(0, 80),
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 50),
  });
}

const incompat = all.filter((x) => x.compat === "incompativel");
const revisar = all.filter((x) => x.compat === "revisar");
console.log(JSON.stringify({ incompat, revisarCount: revisar.length, all }, null, 2));
