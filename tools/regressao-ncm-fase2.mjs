/**
 * Regressão NCM Fase 1+2 — packliste-DE (real LLM), Stoßdämpfer, patinetes batch.
 * VPS: source /etc/cia-alpha44/api.env && node tools/regressao-ncm-fase2.mjs [--cold]
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSupplierFile } from "@cia/pipeline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const cold = process.argv.includes("--cold");

if (cold) process.env.NCM_CACHE_DISABLE = "1";

const { getState } = await import(join(root, "apps/api/dist/state.js"));
const { montarItens } = await import(join(root, "apps/api/dist/services/cotacao.js"));

const GABARITO = ["84", "82", "96", "73", "85", "85", "94", "94", "87", "95", "87", "73", "63", "61"];

const fixture = join(root, "packages/pipeline/test/fixtures/packliste-DE-2026-0815.xlsx");
const faturaPath = join(root, "tools/fatura-92-limpa-classificar.json");

const state = getState();
const parsed = await parseSupplierFile(new Uint8Array(readFileSync(fixture)));

console.log(`\n=== REGRESSÃO NCM Fase 1+2 (${cold ? "COLD" : "warm"}) ===\n`);

const t0 = Date.now();
const { itens, provider, classificacaoCache } = await montarItens(parsed.linhas, state);
console.log(`provider: ${provider} | cache: ${JSON.stringify(classificacaoCache)} | ${Date.now() - t0}ms\n`);

let acertos = 0;
const linhas = [];
for (let i = 0; i < GABARITO.length; i++) {
  const it = itens[i];
  const ncm = (it?.ncm || "").padStart(8, "0");
  const cap = ncm.slice(0, 2);
  const ok = cap === GABARITO[i];
  if (ok) acertos++;
  const pendente = !it?.ncm || ncm === "00000000" || (it?.avisos ?? []).some((a) => /pendente|incompat/i.test(a));
  linhas.push({ idx: i + 1, cap, ncm, esperado: GABARITO[i], ok, pendente, desc: (it?.descOriginal ?? "").slice(0, 50), fonte: it?.ncmFonte, avisos: it?.avisos ?? [] });
  console.log(`${String(i + 1).padStart(2)} ${ok ? "OK" : "FAIL"} cap=${cap} ncm=${ncm || "(vazio)"} esp=${GABARITO[i]} | ${linhas[i].desc}`);
}

console.log(`\n1. packliste-DE: ${acertos}/14 capítulos`);

const stoss = itens[10];
console.log(`\n2. Stoßdämpfer item 11: ncm=${stoss?.ncm} pos=${(stoss?.ncm || "").slice(0, 4)} fonte=${stoss?.ncmFonte} conf=${stoss?.ncmConfianca}`);

const fatura = JSON.parse(readFileSync(faturaPath, "utf8"));
const linhasPat = fatura.linhas.filter((l) => /ES-T19A-10(BLK|WHI)/i.test(l.descOriginal ?? ""));
const { itens: patItens } = await montarItens(linhasPat, state);

console.log(`\n3. fatura-92 patinetes BLK+WHI:`);
let patOk = true;
for (const it of patItens) {
  const sku = (it.descOriginal ?? "").match(/ES-T19A-10\w+/)?.[0] ?? "?";
  const ok = it.ncm === "87116000";
  if (!ok) patOk = false;
  console.log(`   ${sku}: ${it.ncm} @ ${it.ncmConfianca} (${it.ncmFonte}) ${ok ? "OK" : "FAIL"}`);
}

const problemas = linhas.filter((l) => !l.ok || l.pendente);
console.log(`\n4. Itens packliste fora do gabarito ou pendentes: ${problemas.length}`);
for (const p of problemas) {
  console.log(`   [${p.idx}] cap=${p.cap} esp=${p.esperado} ncm=${p.ncm} | ${p.desc}`);
  for (const a of p.avisos.filter((x) => /pendente|incompat/i.test(x))) console.log(`      aviso: ${a.slice(0, 100)}`);
}

const pass = acertos === 14 && stoss?.ncm === "87149990" && patOk;
console.log(`\n=== ${pass ? "VERDE ✅" : "VERMELHO ❌"} ===\n`);
process.exit(pass ? 0 : 1);
