#!/usr/bin/env node
/**
 * Importa planilha "IMPORTAÇÕES DA CHINA NOVO.xlsx" → seed JSON da plataforma.
 * Uso: node tools/import-benchmark-china.cjs [caminho.xlsx]
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const root = path.join(__dirname, "..");
const srcOut = path.join(root, "packages/pipeline/src/data/benchmark-fob-kg-innove.json");
const defaultXlsx = path.join(process.env.USERPROFILE || "", "Desktop", "IMPORTAÇÕES DA CHINA NOVO.xlsx");

async function main() {
  const xlsxPath = process.argv[2] || defaultXlsx;
  if (!fs.existsSync(xlsxPath)) {
    console.error("Arquivo não encontrado:", xlsxPath);
    process.exit(1);
  }

  const { parseBenchmarkPlanilhaBuffer } = await import(
    pathToFileURL(path.join(root, "packages/pipeline/dist/benchmark-planilha.js")).href
  );
  const { saveBenchmarkPlanilha } = await import(
    pathToFileURL(path.join(root, "packages/pipeline/dist/benchmark-historico-store.js")).href
  );

  const bytes = fs.readFileSync(xlsxPath);
  const seed = parseBenchmarkPlanilhaBuffer(bytes, path.basename(xlsxPath));
  saveBenchmarkPlanilha(seed, srcOut);
  console.log("Importado:", seed.total, "NCMs");
  console.log("Período:", seed.periodoReferencia);
  console.log("Salvo em:", srcOut);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
