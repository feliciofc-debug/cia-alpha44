/**
 * Teste E2E: parse local → classificar + calcular na API de produção.
 * Uso: node tools/test-analise-e2e.mjs "<planilha>" [API_BASE]
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { parseSupplierFile } from "../packages/pipeline/dist/parser.js";

const arquivo = process.argv[2];
const BASE = (process.argv[3] ?? "https://api2.amzofertas.com.br/cia").replace(/\/$/, "");

if (!arquivo) {
  console.error("Uso: node tools/test-analise-e2e.mjs <planilha> [API_BASE]");
  process.exit(1);
}

const buf = fs.readFileSync(arquivo);
const parsed = parseSupplierFile(new Uint8Array(buf));
console.log("=== PARSE LOCAL ===");
console.log("Arquivo:", path.basename(arquivo));
console.log("Linhas:", parsed.totalLinhas, "| Aba:", parsed.abaUsada);
if (parsed.avisos.length) console.log("Avisos:", parsed.avisos.join(" · "));

console.log("\n=== META API ===");
const meta = await fetch(`${BASE}/api/meta`).then((r) => r.json());
console.log(JSON.stringify(meta, null, 2));

console.log("\n=== CLASSIFICAR (IA) ===");
const t0 = Date.now();
const classRes = await fetch(`${BASE}/api/classificar`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ linhas: parsed.linhas }),
});
if (!classRes.ok) throw new Error(`classificar ${classRes.status}: ${await classRes.text()}`);
const { itens, provider } = await classRes.json();
console.log("Provider:", provider, `(${(Date.now() - t0) / 1000}s)`);

const mock = itens.some((it) => (it.descDuimp ?? "").includes("pendente de IA"));
console.log("Mock fallback?", mock ? "SIM — problema" : "NAO — IA OK");

console.log("\n--- Itens ---");
for (const [i, it] of itens.entries()) {
  const canal = it.risco?.canal ?? "(sem calc ainda)";
  console.log(
    `${i + 1}. ${(it.descPt || it.descOriginal).slice(0, 55)} | NCM ${it.ncm} | canal ${canal}`,
  );
  if (it.descDuimp) console.log(`   DUIMP: ${it.descDuimp.slice(0, 100)}…`);
}

const cambio = await fetch(`${BASE}/api/cambio?moeda=USD`).then((r) => r.json());
const cotacao = {
  cliente: "Teste E2E",
  benefFiscal: "ALAGOAS",
  moeda: "US$",
  cambio: cambio.cotacaoVenda ?? 5.2,
  freteTotalUS: 0,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  siscomex: 154.23,
  antidumpingBRL: 0,
  incoterm: "CFR",
  origem: "RJ",
  destino: "SP",
  itens,
  despesas: [],
  params: {
    markupPct: 0.06,
    pisSaida: 0.0165,
    cofinsSaida: 0.076,
    icmsSaida: 0.04,
    csllSobreMarkup: 0.09,
    irrfAliq: 0.25,
    irrfBaseNotaPct: 0.027,
    ipiTetoAliqMedia: 0.15,
    icmsEntrada: 0,
  },
};

console.log("\n=== CALCULAR (engine fiscal) ===");
const calcRes = await fetch(`${BASE}/api/calcular`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(cotacao),
});
if (!calcRes.ok) throw new Error(`calcular ${calcRes.status}: ${await calcRes.text()}`);
const { resultado, itens: itensCalc } = await calcRes.json();
console.log("Total BRL:", resultado.totalBRL?.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const canais = {};
for (const it of itensCalc) {
  const c = it.risco?.canal ?? "?";
  canais[c] = (canais[c] ?? 0) + 1;
}
console.log("Canais:", canais);
console.log("\n=== TESTE OK ===");
