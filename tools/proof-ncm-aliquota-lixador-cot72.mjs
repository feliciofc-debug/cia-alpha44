#!/usr/bin/env node
/**
 * Prova imposto: ordem 3 cotação 72 — lixador 84798999 (errado) → 84732910 (certo).
 * FOB ~US$ 58k; II 12,6%→10,8%; IPI 0%→15%.
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const ORDEM = Number(process.argv[3] ?? 3);
const NCM_ERRADO = "84798999";
const NCM_CERTO = "84732910";

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

async function api(method, path, body) {
  const h = await authHeaders();
  const opts = { method, headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${API}${path}`, opts);
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* */
  }
  return { status: r.status, ok: r.ok, json, text };
}

function totalBrl(c) {
  return c?.financeiro?.totalBRL ?? c?.resultado?.totalBRL ?? c?.totalBRL;
}
function item(c) {
  return c?.itens?.find((it) => (it.ordem ?? -1) === ORDEM);
}
function snap(it) {
  if (!it) return null;
  return {
    ncm: (it.ncm ?? "").replace(/\D/g, ""),
    ii: it.aliquotas?.ii,
    ipi: it.aliquotas?.ipi,
    fobUS: it.fobEmbarqueUS ?? it.fobTotalUS,
    fobKgPlanilha: it.calibracao?.fobKgCalibrado,
    ncmRevisadoHumano: it.ncmRevisadoHumano,
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 55),
  };
}

async function resetErrado() {
  let det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
  const it = item(det);
  if (it?.ncmRevisadoHumano) {
    await api("POST", `/api/cotacoes/${COT_ID}/itens/${ORDEM}/desfazer-ncm`, {});
    det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
  }
  const ncm = (item(det)?.ncm ?? "").replace(/\D/g, "");
  if (ncm !== NCM_ERRADO) {
    const p = await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ORDEM}/ncm`, { ncm: NCM_ERRADO });
    if (!p.ok) throw new Error(`reset PATCH: ${p.status} ${p.text.slice(0, 200)}`);
    return p.json;
  }
  return det;
}

console.log("=== PROVA imposto — lixador ordem 3 (cot 72, 21 itens) ===");
console.log(`${NCM_ERRADO} → ${NCM_CERTO} | confirmação INDIVIDUAL`);

let det = await resetErrado();
const antesTotal = totalBrl(det);
const antesItem = snap(item(det));
console.log("\n--- ANTES ---");
console.log(JSON.stringify({ totalBRL: antesTotal, item: antesItem }, null, 2));

const patch = await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ORDEM}/ncm`, { ncm: NCM_CERTO });
if (!patch.ok) throw new Error(`PATCH: ${patch.status}`);
console.log("\n--- APÓS PATCH ---");
console.log(JSON.stringify({ totalBRL: totalBrl(patch.json), item: snap(item(patch.json)) }, null, 2));

const conf = await api("POST", `/api/cotacoes/${COT_ID}/itens/${ORDEM}/confirmar-ncm`, {
  confirmadoPor: "proof-ncm-aliquota-lixador@45957d9",
});
if (!conf.ok) throw new Error(`confirm: ${conf.status}`);

const depois = conf.json;
const depoisTotal = totalBrl(depois);
const depoisItem = snap(item(depois));
const delta = depoisTotal - antesTotal;

console.log("\n--- DEPOIS (confirm individual) ---");
console.log(JSON.stringify({ totalBRL: depoisTotal, item: depoisItem }, null, 2));

console.log("\n--- CHECKLIST ---");
console.log(`II: ${antesItem?.ii} → ${depoisItem?.ii}`);
console.log(`IPI: ${antesItem?.ipi} → ${depoisItem?.ipi}`);
console.log(`Δ Total: R$ ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}`);

const iiMudou = Math.abs((antesItem?.ii ?? 0) - (depoisItem?.ii ?? 0)) > 0.0001;
const ipiMudou = Math.abs((antesItem?.ipi ?? 0) - (depoisItem?.ipi ?? 0)) > 0.0001;
const totalMudou = Math.abs(delta) > 100;

const pass = iiMudou && ipiMudou && totalMudou && depoisItem?.ncm === NCM_CERTO;
console.log(pass ? "\nPASS" : "\nFAIL");
process.exit(pass ? 0 : 1);
