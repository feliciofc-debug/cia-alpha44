#!/usr/bin/env node
/** Diagnóstico FOB planilha × peso bruto — cotação 72 via API. */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const ALVO = 47_036;

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
  return it.benchmark?.fobKgMedioDI ?? it.benchmark?.mediaFobKg ?? null;
}

const h = await authHeaders();
const det = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h }).then((r) => r.json());
const calc = await fetch(`${API}/api/calcular`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ ...(det.cotacao ?? det), itens: det.itens }),
}).then((r) => r.json());

const itens = calc.itens ?? [];
console.log("ordem\tncm\tfobKg\tpesoBruto\tpesoLiq\tqtd\tfobTotal\tfobKg×bruto\tΔ");
let sum = 0;
let sumBruto = 0;
const bad = [];
for (const it of itens) {
  const fobKg = fobKgPlanilha(it);
  const bruto = it.pesoBrutoKg ?? 0;
  const liq = it.pesoLiqKg ?? 0;
  const fob = it.fobTotalUS ?? 0;
  const esp = fobKg != null && bruto > 0 ? fobKg * bruto : null;
  sum += fob;
  if (esp != null) sumBruto += esp;
  const delta = esp != null ? fob - esp : null;
  const flag = delta != null && Math.abs(delta) > 1 ? "BAD" : "";
  if (flag) bad.push({ ordem: it.ordem, ncm: it.ncm, fob, esp, delta, bruto, liq, qtd: it.qtd });
  console.log(
    `${it.ordem}\t${it.ncm}\t${fobKg?.toFixed(4) ?? "—"}\t${bruto}\t${liq}\t${it.qtd ?? "—"}\t${fob.toFixed(2)}\t${esp?.toFixed(2) ?? "—"}\t${delta?.toFixed(2) ?? "—"} ${flag}`,
  );
}
console.log(`\nΣ fobTotalUS: ${sum.toFixed(2)} | Σ fobKg×bruto: ${sumBruto.toFixed(2)} | alvo: ${ALVO}`);
console.log(`ratio: ${(sum / ALVO).toFixed(3)}x | bad lines: ${bad.length}`);
for (const b of bad) {
  console.log(`  BAD ordem=${b.ordem} ncm=${b.ncm} fob=${b.fob.toFixed(2)} esp=${b.esp?.toFixed(2)} bruto=${b.bruto} liq=${b.liq} qtd=${b.qtd}`);
}
