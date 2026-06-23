#!/usr/bin/env node
/** Prova offline — carrinho + trena (sem DB), espelha cotação sim-china. */
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditarItemNcmParaPdf,
  enriquecerItensPdfNcmAudit,
  itensResolucaoNcm,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itemPodeConfirmarNcmIndividual,
  mesclarItensInvalidosPdfAudit,
} from "@cia/shared";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);

const ctx = criarPdfNcmAuditCtx(criarNcmCatalog(loadNcmVigente()));

const base = (partial) => ({
  descOriginal: partial.descPt,
  descPt: partial.descPt,
  descDuimp: partial.descPt,
  ncmValido: true,
  pesoLiqKg: 1,
  fobTotalUS: 10,
  aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
  ...partial,
});

const carrinhoRaw = base({
  ordem: 3,
  descPt: "Carrinho de controle remoto (brinquedo)",
  ncm: "95030097",
  ncmFonte: "ia",
  compatibilidadeProduto: "compativel",
  ncmConfianca: 0.9,
});

const trenaRaw = base({
  ordem: 6,
  descPt: "Trena 5 metros",
  ncm: "84659110",
  ncmFonte: "siscomex",
  compatibilidadeProduto: "compativel",
  ncmConfianca: 0.95,
});

console.log("=== PASSO 1 — DUMP (front sem ctx, antes do fix) ===\n");
for (const it of [carrinhoRaw, trenaRaw]) {
  const auditComCtx = auditarItemNcmParaPdf(it, ctx);
  const auditSemCtx = auditarItemNcmParaPdf(it);
  console.log(JSON.stringify({
    desc: it.descPt,
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
    itemPrecisaResolucao_semCtx: itemPrecisaResolucaoNcm(it),
    quebra: itemBloqueiaPdfNcm(it, ctx) && !itemPrecisaResolucaoNcm(it) ? "SIM" : "não",
  }, null, 2));
  console.log("---");
}

console.log("\n=== PASSO 2 — FIX (GET enriquecido + merge 422) ===\n");

const itensGet = enriquecerItensPdfNcmAudit([carrinhoRaw, trenaRaw], ctx);
const itens422 = mesclarItensInvalidosPdfAudit([carrinhoRaw, trenaRaw], [
  { ordem: 3, avisos: ["NCM 95030097 incoerente com o produto."] },
  { ordem: 6, avisos: ["NCM 84659110 incoerente com o produto."] },
]);

function printBarra(label, itens) {
  const barra = itensResolucaoNcm(itens).filter(({ item }) =>
    /carrinho|trena/i.test(item.descPt || ""),
  );
  console.log(`--- ${label} ---`);
  for (const { ordem, item } of barra) {
    console.log(
      `  #${ordem} ${item.descPt} | bloqueia=${itemBloqueiaPdfNcm(item)} | resolucao=${itemPrecisaResolucaoNcm(item)} | confirmar=${itemPodeConfirmarNcmIndividual(item)} | editar=sim`,
    );
  }
  console.log(`  total: ${barra.length}\n`);
  return barra.length;
}

const nGet = printBarra("Barra após GET (pdfNcmAudit)", itensGet);
const n422 = printBarra("Barra após 422 (mesclarItensInvalidosPdfAudit)", itens422);

const ok = nGet === 2 && n422 === 2;
console.log(ok ? "OK — invariante satisfeita" : "FALHA — itens bloqueados fora da barra");
process.exit(ok ? 0 : 1);
