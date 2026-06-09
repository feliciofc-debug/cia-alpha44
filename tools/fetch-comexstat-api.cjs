#!/usr/bin/env node
/**
 * Atualiza o seed ComexStat direto da API MDIC (FOB/kg por NCM).
 * Filtros padrão: 1º sem/2023 · China (160) · marítima (01).
 *
 * Uso: node tools/fetch-comexstat-api.cjs [arquivo-saida.json]
 */
const path = require("node:path");

async function main() {
  const outArg = process.argv[2];
  const dist = path.join(__dirname, "..", "packages", "pipeline", "dist");
  const { fetchComexStatSeed, COMEXSTAT_CHINA_MARITIMO_2023S1 } = await import(
    pathToFileURL(path.join(dist, "comexstat-api.js")).href
  );

  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(__dirname, "..", "packages", "pipeline", "src", "data", "comexstat-china-2023s1.json");
  console.log("ComexStat API — filtros:", COMEXSTAT_CHINA_MARITIMO_2023S1);
  console.log("Consultando...", API_HINT);

  const data = await fetchComexStatSeed(outPath);
  console.log(`OK: ${data.total} NCMs -> ${outPath}`);
  console.log(`Contexto: ${data.contexto}`);
  if (data.itens.length >= 3) {
    const s = data.itens.filter((e) => e.ncm.startsWith("9405")).slice(0, 3);
    for (const e of s) {
      console.log(`  ${e.ncm} FOB/kg US$ ${e.fobKg.toFixed(4)}`);
    }
  }
}

const API_HINT = "https://api-comexstat.mdic.gov.br/general";

function pathToFileURL(p) {
  const u = path.resolve(p).replace(/\\/g, "/");
  return new URL(`file:///${u}`);
}

main().catch((e) => {
  console.error("ERRO:", e.message ?? e);
  process.exit(1);
});
