#!/usr/bin/env node
/**
 * Prova: conciliação cotação 72 — NCM coluna = planilha China por descrição (não Siscomex/IA operacional).
 */
import { createClerkClient } from "@clerk/backend";
import {
  defaultBenchmarkPlanilhaPath,
  loadBenchmarkPlanilha,
  resolverNcmConciliacaoPlanilhaChina,
  buildBenchmarkIndex,
  historicoFromPlanilhaSeed,
  substituirHistoricoBenchmark,
} from "../packages/pipeline/dist/index.js";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
const benchmarkIndex = buildBenchmarkIndex([]);
const planilha = seed?.itens ?? [];

const h = await authHeaders();
console.log("=== PROVA conciliação NCM planilha China — cot 72 ===\n");

const det = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h }).then((r) => r.json());
const itens = det.itens ?? det.cotacao?.itens ?? [];
if (!itens.length) {
  console.error("sem itens", JSON.stringify(det).slice(0, 400));
  process.exit(1);
}

const bad = [];
console.log("ordem\tdescPt\tncmOper\tncmConcil\tfobKgPlanilha\tncmFonteOp\tstatus");
for (const it of itens) {
  const hit = resolverNcmConciliacaoPlanilhaChina(it, planilha, benchmarkIndex);
  const ncmConcil = hit?.ncm ?? "—";
  const ncmOp = it.ncm ?? "—";
  const ok = hit != null && ncmConcil === hit.ncm;
  if (!hit) bad.push({ ordem: it.ordem, motivo: "sem hit planilha China" });
  else if (ncmOp !== ncmConcil && it.ncmFonte === "siscomex") {
    /* esperado — conciliação não usa Siscomex */
  }
  console.log(
    `${it.ordem}\t${(it.descPt ?? "").slice(0, 28)}\t${ncmOp}\t${ncmConcil}\t${hit?.fobKgMedioDI?.toFixed(4) ?? "—"}\t${it.ncmFonte ?? "—"}\t${ok ? "OK" : "MISS"}`,
  );
}

const exp = await fetch(`${API}/api/cotacoes/${COT_ID}/conciliacao?formato=csv`, { headers: h });
if (!exp.ok) {
  console.error("export falhou", exp.status, await exp.text().then((t) => t.slice(0, 200)));
  process.exit(1);
}
const csvBuf = Buffer.from(await exp.arrayBuffer());
const csv = csvBuf.toString("utf8");
const lines = csv.split(/\r?\n/).filter(Boolean);
const headerLine = lines.find((l) => l.includes("NCM") && l.includes("Fonte NCM")) ?? lines[0] ?? "";
const header = headerLine.split(";");
const ncmIdx = header.findIndex((h) => h.replace(/\uFEFF/g, "") === "NCM");
const fonteIdx = header.findIndex((h) => h === "Fonte NCM");
const dataStart = lines.indexOf(headerLine) + 1;

console.log("\n--- Export CSV ---");
console.log(`Linhas dados: ${Math.max(0, lines.length - 3)} | col NCM idx=${ncmIdx} | Fonte NCM idx=${fonteIdx}`);

let csvBad = 0;
for (let i = dataStart; i < lines.length; i++) {
  const line = lines[i];
  if (line.startsWith("TOTAIS") || !line.trim()) continue;
  const cols = line.split(";");
  const ncmCsv = cols[ncmIdx]?.replace(/\D/g, "").slice(0, 8);
  const fonteCsv = cols[fonteIdx];
  const it = itens[i - dataStart];
  if (!it) continue;
  const hit = resolverNcmConciliacaoPlanilhaChina(it, planilha, benchmarkIndex);
  if (!hit || ncmCsv !== hit.ncm || fonteCsv !== "planilha China") {
    csvBad++;
    console.log(`  ✗ linha ${i - 1}: csv ncm=${ncmCsv} fonte=${fonteCsv} esperado=${hit?.ncm}`);
  }
}

console.log("\n--- RESUMO ---");
console.log(`Itens: ${itens.length} | sem hit: ${bad.length} | CSV divergente: ${csvBad}`);
const pass = bad.length === 0 && csvBad === 0;
console.log(pass ? "\nPASS proof-conciliacao-ncm-cot72" : "\nFAIL proof-conciliacao-ncm-cot72");
process.exit(pass ? 0 : 1);
