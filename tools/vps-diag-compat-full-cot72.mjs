#!/usr/bin/env node
/** Lista itens incompativel/revisar e NCM planilha sugerido — cotação 72. */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, "..");

const { criarNcmCatalog, loadNcmVigenteCache, carregarItensPlanilhaChinaOperacional, resolverNcmClassificacaoPlanilhaChina, buildBenchmarkIndex, loadComexSeed, mesclarItemMeta } =
  await import(pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href);
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
if (!row) throw new Error("cot 72 not found");

const catalog = criarNcmCatalog(loadNcmVigenteCache());
const comex = loadComexSeed();
const benchmarkIndex = buildBenchmarkIndex(comex.itens, comex.contexto);
const planilhaItens = carregarItensPlanilhaChinaOperacional();

const incompat = [];
const revisar = [];
let sumFob = 0;

for (const itemRow of row.itens) {
  const it = mesclarItemMeta(
    {
      ordem: itemRow.ordem,
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: Number(itemRow.pesoLiqKg),
      pesoBrutoKg: itemRow.pesoBrutoKg != null ? Number(itemRow.pesoBrutoKg) : null,
      fobTotalUS: Number(itemRow.fobTotalUS),
    },
    itemRow.meta,
  );
  sumFob += it.fobTotalUS ?? 0;

  const { resultado } = avaliarCompatibilidadeProduto(catalog, {
    descricao: it.descOriginal,
    material: itemRow.material ?? undefined,
    ncm: it.ncm,
    familiaId: it.familiaProdutoId,
  });

  const hitChina = resolverNcmClassificacaoPlanilhaChina(
    {
      descOriginal: it.descOriginal,
      ncm: it.ncm,
      material: itemRow.material ?? null,
      uso: itemRow.uso ?? null,
      qtd: null,
      pesoBrutoKg: it.pesoBrutoKg ?? null,
      pesoLiqKg: it.pesoLiqKg,
      fobUnitarioUS: null,
      fobTotalUS: it.fobTotalUS,
    },
    planilhaItens,
    benchmarkIndex,
    catalog,
  );

  const meta = itemRow.meta && typeof itemRow.meta === "object" ? itemRow.meta : {};
  const linha = {
    ordem: itemRow.ordem,
    ncmAtual: it.ncm,
    ncmFonte: meta.ncmFonte ?? "—",
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 55),
    compatDb: meta.compatibilidadeProduto ?? it.compatibilidadeProduto,
    compatCalc: resultado.compatibilidadeProduto,
    motivo: resultado.motivoCompatibilidade?.slice(0, 100),
    fobTotal: (it.fobTotalUS ?? 0).toFixed(2),
    planilhaChina: hitChina
      ? { ncm: hitChina.ncm, fobKg: hitChina.fobKgMedioDI, score: hitChina.score }
      : null,
  };

  if (resultado.compatibilidadeProduto === "incompativel") incompat.push(linha);
  else if (resultado.compatibilidadeProduto === "revisar") revisar.push(linha);
}

console.log(
  JSON.stringify(
    {
      id: row.id,
      sumFobTotalUS: sumFob,
      alvoPaulo: 47036,
      incompatCount: incompat.length,
      revisarCount: revisar.length,
      incompat,
      revisarTop5: revisar.slice(0, 5),
    },
    null,
    2,
  ),
);
