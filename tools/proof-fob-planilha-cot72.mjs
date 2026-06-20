#!/usr/bin/env node
/**
 * Prova: cotação 72 — FOB/kg planilha China × peso BRUTO (毛重 total da linha).
 * Audita item a item: fobTotal === fobKg×bruto; Σ alvo US$ 47.036.
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const ALVO_FOB = 47_036;
const TOL_PCT = 0.02;

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

function fobKgPlanilha(it) {
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  return it.benchmark?.fobKgMedioDI ?? it.benchmark?.mediaFobKg ?? null;
}

const h = await authHeaders();
console.log("=== PROVA FOB planilha × peso BRUTO — cot 72 ===\n");

const det = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h }).then((r) => r.json());
const c = det.cotacao ?? det;
const calc = await fetch(`${API}/api/calcular`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ ...c, itens: det.itens ?? c.itens }),
}).then((r) => r.json());

if (!calc.itens?.length) {
  console.error("calcular falhou", JSON.stringify(calc).slice(0, 500));
  process.exit(1);
}

const itens = calc.itens;
const pendentes = itens.filter((it) => it.fobPendente);
const bad = [];
let sum = 0;
let sumEsperado = 0;

console.log("ordem\tncm\tfobKg\tpesoBruto\tfobTotal\tfobKg×bruto\tΔ\tstatus");
for (const it of itens) {
  const fobKg = fobKgPlanilha(it);
  const bruto = it.pesoBrutoKg ?? 0;
  const fob = it.fobTotalUS ?? 0;
  const esp = fobKg != null && bruto > 0 ? fobKg * bruto : null;
  sum += fob;
  if (esp != null) sumEsperado += esp;
  const delta = esp != null ? fob - esp : null;
  const ok = esp == null || Math.abs(delta) <= 1;
  if (!ok) bad.push({ ordem: it.ordem, ncm: it.ncm, fob, esp, delta, bruto });
  console.log(
    `${it.ordem}\t${it.ncm}\t${fobKg?.toFixed(4) ?? "—"}\t${bruto}\t${fob.toFixed(2)}\t${esp?.toFixed(2) ?? "—"}\t${delta?.toFixed(2) ?? "—"}\t${ok ? "OK" : "BAD"}`,
  );
}

const balanca = itens.find((it) =>
  /balan|gancho|84233090|84238900|挂钩秤/i.test(`${it.descOriginal} ${it.descPt} ${it.ncm}`),
);

console.log("\n--- RESUMO ---");
console.log(`Itens: ${itens.length} | Pendentes: ${pendentes.length} | BAD linhas: ${bad.length}`);
console.log(`Σ fobTotalUS:     US$ ${sum.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Σ fobKg×bruto:    US$ ${sumEsperado.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Alvo Paulo/CSV:   US$ ${ALVO_FOB.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Engine entrada:   US$ ${(calc.resultado?.entrada?.fobTotalUS ?? sum).toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

if (balanca) {
  const kg = fobKgPlanilha(balanca);
  console.log(`\n★ Balança: ncm=${balanca.ncm} fobKg=${kg?.toFixed(4)} bruto=${balanca.pesoBrutoKg} fob=${balanca.fobTotalUS?.toFixed(2)} pendente=${balanca.fobPendente ?? false}`);
}

for (const b of bad) {
  console.log(`  ✗ ordem ${b.ordem} ncm=${b.ncm}: fob=${b.fob.toFixed(2)} esperado=${b.esp?.toFixed(2)} bruto=${b.bruto}`);
}

const tolAbs = ALVO_FOB * TOL_PCT;
const sumOk = Math.abs(sum - ALVO_FOB) <= tolAbs;
const formulaOk = bad.length === 0 && Math.abs(sum - sumEsperado) < 1;
const balancaOk =
  balanca &&
  Math.abs((fobKgPlanilha(balanca) ?? 0) - 2.8942) < 0.02 &&
  !balanca.fobPendente;
const pass = pendentes.length === 0 && formulaOk && sumOk && balancaOk;

console.log(pass ? "\nPASS proof-fob-planilha-cot72" : "\nFAIL proof-fob-planilha-cot72");
if (!sumOk) {
  console.log(`  → Σ fora do alvo (±${(TOL_PCT * 100).toFixed(0)}%): delta US$ ${(sum - ALVO_FOB).toFixed(2)}`);
}
process.exit(pass ? 0 : 1);
