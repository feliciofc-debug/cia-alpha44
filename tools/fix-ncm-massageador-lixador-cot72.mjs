#!/usr/bin/env node
/**
 * Corrige NCM ordens 1 e 3 cotação 72: 84732910 → 84798999 + cache humano.
 * Alvo: Σ FOB DI ≈ US$ 47.036
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const NCM_ERRADO = "84732910";
const NCM_CERTO = "84798999";
const FOB_KG_ESPERADO = 1.9521;
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

function normNcm(v) {
  return (v ?? "").replace(/\D/g, "").slice(0, 8);
}

function fobKgPlanilha(it) {
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  return it.benchmark?.fobKgMedioDI ?? it.benchmark?.mediaFobKg ?? null;
}

function findItens(itens) {
  const massageador = itens.find((it) =>
    /推脂机|massageador|5178|HY-5178/i.test(`${it.descOriginal ?? ""} ${it.descPt ?? ""}`),
  );
  const lixador = itens.find((it) =>
    /磨脚|80036|HY-80036|lixador.*p[eé]/i.test(`${it.descOriginal ?? ""} ${it.descPt ?? ""}`),
  );
  return { massageador, lixador };
}

async function corrigirItem(det, item, label) {
  if (!item) throw new Error(`${label} não encontrado`);
  const ordem = item.ordem ?? 0;
  const ncmAtual = normNcm(item.ncm);
  console.log(`\n--- ${label} (ordem ${ordem}) ---`);
  console.log(`  desc: ${(item.descPt ?? item.descOriginal ?? "").slice(0, 60)}`);
  console.log(`  NCM atual: ${ncmAtual}`);

  if (ncmAtual !== NCM_CERTO) {
    const patch = await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ordem}/ncm`, { ncm: NCM_CERTO });
    if (!patch.ok) throw new Error(`PATCH NCM ${label} falhou: ${patch.status} ${patch.text.slice(0, 200)}`);
    console.log(`  PATCH → ${NCM_CERTO}: OK`);
  }

  const conf = await api("POST", `/api/cotacoes/${COT_ID}/itens/${ordem}/confirmar-ncm`, {
    confirmadoPor: "fix-ncm-cot72@84798999",
  });
  if (!conf.ok) throw new Error(`confirmar-ncm ${label} falhou: ${conf.status} ${conf.text.slice(0, 200)}`);
  const it = conf.json.itens.find((x) => (x.ordem ?? -1) === ordem) ?? conf.json.itens[ordem];
  const fobKg = fobKgPlanilha(it);
  console.log(`  confirmar-ncm: OK | ncm=${normNcm(it?.ncm)} fobKg=${fobKg?.toFixed(4)} humano=${it?.ncmRevisadoHumano}`);

  const classif = await api("POST", "/api/classificar", {
    linhas: [{ descOriginal: item.descOriginal, material: item.material, uso: item.uso, ncm: "" }],
  });
  const hit = classif.json?.itens?.[0];
  const cacheOk =
    hit?.ncmClassificacaoCache === "humano" && normNcm(hit?.ncm) === NCM_CERTO;
  console.log(`  cache humano: ${cacheOk ? "OK" : "FAIL"} (ncm=${normNcm(hit?.ncm)} origem=${hit?.ncmClassificacaoCache})`);

  return { ordem, ncm: normNcm(it?.ncm), fobKg, cacheOk, fobTotal: it?.fobTotalUS ?? 0 };
}

console.log("=== FIX NCM massageador + lixador — cotação 72 ===\n");

let det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
if (!det?.itens?.length) throw new Error("cotação sem itens");

const { massageador, lixador } = findItens(det.itens);
const sumAntes = det.itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
console.log(`Itens: ${det.itens.length} | Σ FOB antes: US$ ${sumAntes.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

const r1 = await corrigirItem(det, massageador, "Massageador 推脂机");
const r2 = await corrigirItem(det, lixador, "Lixador 磨脚皮器 HY-80036");

det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
const calcRes = await api("POST", "/api/calcular", {
  ...det.cotacao,
  itens: det.itens,
});
const itensCalc = calcRes.json?.itens ?? det.itens;
const sumDepois = itensCalc.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
const engineFob = calcRes.json?.resultado?.entrada?.fobTotalUS ?? sumDepois;

console.log("\n=== TOTAIS ===");
console.log(`Σ FOB antes:  US$ ${sumAntes.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Σ FOB depois: US$ ${sumDepois.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Engine FOB:   US$ ${engineFob.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);
console.log(`Alvo:         US$ ${ALVO_FOB.toLocaleString("en-US", { minimumFractionDigits: 2 })}`);

console.log("\n=== ITENS CORRIGIDOS ===");
for (const r of [r1, r2]) {
  const okNcm = r.ncm === NCM_CERTO;
  const okFob = r.fobKg != null && Math.abs(r.fobKg - FOB_KG_ESPERADO) < 0.05;
  console.log(
    `ordem ${r.ordem}: ncm=${r.ncm} fobKg=${r.fobKg?.toFixed(4)} fobTotal=US$ ${r.fobTotal.toFixed(2)} | ncm=${okNcm ? "OK" : "FAIL"} fobKg=${okFob ? "OK" : "FAIL"} cache=${r.cacheOk ? "OK" : "FAIL"}`,
  );
}

console.log("\n=== TODOS OS ITENS (pós-fix) ===");
console.log("ordem\tncm\tfobKg\tbruto\tfobTotal");
for (const it of itensCalc.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))) {
  const kg = fobKgPlanilha(it);
  console.log(
    `${it.ordem}\t${it.ncm}\t${kg?.toFixed(4) ?? "—"}\t${it.pesoBrutoKg ?? "—"}\t${(it.fobTotalUS ?? 0).toFixed(2)}`,
  );
}

const tolAbs = ALVO_FOB * TOL_PCT;
const totalOk = Math.abs(sumDepois - ALVO_FOB) <= tolAbs;
const ncmOk = r1.ncm === NCM_CERTO && r2.ncm === NCM_CERTO;
const fobKgOk =
  Math.abs((r1.fobKg ?? 0) - FOB_KG_ESPERADO) < 0.05 && Math.abs((r2.fobKg ?? 0) - FOB_KG_ESPERADO) < 0.05;
const cacheOk = r1.cacheOk && r2.cacheOk;
const pass = ncmOk && fobKgOk && cacheOk && totalOk;

console.log(pass ? "\nPASS fix-ncm-massageador-lixador-cot72" : "\nFAIL fix-ncm-massageador-lixador-cot72");
if (!totalOk) console.log(`  → Σ fora do alvo ±${(TOL_PCT * 100).toFixed(0)}%: delta US$ ${(sumDepois - ALVO_FOB).toFixed(2)}`);
process.exit(pass ? 0 : 1);
