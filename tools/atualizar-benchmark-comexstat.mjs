#!/usr/bin/env node
/**
 * Regenera seed ComexStat com período recente (últimos 12 meses fechados).
 * A ponderada recente complementa a média-DI da planilha 2023.
 *
 * Uso:
 *   node tools/atualizar-benchmark-comexstat.mjs [arquivo-saida.json] [nMeses]
 *
 * Requer build prévio: npm run build -w @cia/pipeline
 */
const path = require("node:path");

function pathToFileURL(p) {
  const u = path.resolve(p).replace(/\\/g, "/");
  return new URL(`file:///${u}`);
}

async function main() {
  const outArg = process.argv[2];
  const nMeses = Number.parseInt(process.argv[3] ?? "12", 10);
  const dist = path.join(__dirname, "..", "packages", "pipeline", "dist");

  const { fetchComexStatSeed, filtrosUltimosMesesFechados, periodoLabel } = await import(
    pathToFileURL(path.join(dist, "comexstat-api.js")).href
  );

  const filtros = filtrosUltimosMesesFechados(Number.isFinite(nMeses) ? nMeses : 12);
  const periodo = periodoLabel(filtros.periodoDe, filtros.periodoAte);
  const defaultName = `comexstat-china-recent-${periodo.replace(/\.\./g, "_")}.json`;
  const outPath = outArg
    ? path.resolve(outArg)
    : path.join(__dirname, "..", "packages", "pipeline", "src", "data", defaultName);

  console.log("ComexStat — últimos meses fechados:", filtros);
  console.log("Período rótulo:", periodo);
  console.log("Consultando API...");

  const data = await fetchComexStatSeed(outPath, filtros);
  console.log(`OK: ${data.total} NCMs -> ${outPath}`);
  console.log(`Contexto: ${data.contexto}`);
  console.log(`periodoReferencia: ${data.periodoReferencia ?? periodo}`);

  const lustre = data.itens.find((e) => e.ncm === "94051190");
  if (lustre) {
    console.log(`  94051190 FOB/kg ponderado US$ ${lustre.fobKg.toFixed(4)}`);
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message ?? e);
  process.exit(1);
});
