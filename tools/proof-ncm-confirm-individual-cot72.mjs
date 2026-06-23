#!/usr/bin/env node
/**
 * Prova E2E: confirmação NCM individual — balança de gancho cotação 72.
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const NCM_ERRADO = "84238900";
const NCM_CERTO = "84233090";
const FOB_KG_ESPERADO = 2.8942;
const TOL_FOB = 0.001;

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

function findBalanca(itens) {
  return itens.find(
    (it) =>
      /balan[cç]a|gancho|84238900|84233090|挂钩秤|HY-97/i.test(`${it.descOriginal ?? ""} ${it.descPt ?? ""}`) ||
      ["84238900", "84233090"].includes((it.ncm ?? "").replace(/\D/g, "")),
  );
}

function snapItem(it) {
  const fobKgPlanilha =
    it.calibracao?.fobKgCalibrado ?? it.benchmark?.fobKgMedioDI ?? it.benchmark?.mediaFobKg ?? null;
  return {
    ordem: it.ordem,
    desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 70),
    descOriginal: it.descOriginal,
    ncm: (it.ncm ?? "").replace(/\D/g, ""),
    ii: it.aliquotas?.ii,
    ipi: it.aliquotas?.ipi,
    fobKgPlanilha,
    fobKgInvoice: it.pesoLiqKg > 0 ? (it.fobEmbarqueUS ?? it.fobTotalUS ?? 0) / it.pesoLiqKg : null,
    fobKgFonte: it.fobKgFonte,
    ncmClassificacaoCache: it.ncmClassificacaoCache,
    ncmRevisadoHumano: it.ncmRevisadoHumano,
    benchmarkNcm: it.benchmark?.nota?.match(/\d{4}\.\d{2}\.\d{2}/)?.[0],
  };
}

function totalBrl(c) {
  return c?.financeiro?.totalBRL ?? c?.resultado?.totalBRL ?? c?.totalBRL;
}

console.log("=== PROVA NCM confirmação individual — cotação 72 ===");
console.log(`commit esperado VPS: 45957d9 | API: ${API}`);
console.log(`Cotação: ${COT_ID}`);

let det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
const balanca = findBalanca(det.itens);
if (!balanca) throw new Error("balança não encontrada");
const ordem = balanca.ordem ?? 0;

// Reset baseline
if (balanca.ncmRevisadoHumano) {
  await api("POST", `/api/cotacoes/${COT_ID}/itens/${ordem}/desfazer-ncm`, {});
  det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
}
const ncmAtual = (findBalanca(det.itens).ncm ?? "").replace(/\D/g, "");
if (ncmAtual !== NCM_ERRADO) {
  await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ordem}/ncm`, { ncm: NCM_ERRADO });
  det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
}

const antesTotal = totalBrl(det);
const antesItem = snapItem(findBalanca(det.itens));
console.log("\n--- ANTES (84238900, sem confirmação) ---");
console.log(JSON.stringify({ totalBRL: antesTotal, item: antesItem }, null, 2));

// Corrigir NCM + confirmação INDIVIDUAL (caminho que estava quebrado)
await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ordem}/ncm`, { ncm: NCM_CERTO });
const posPatch = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
const posPatchItem = snapItem(findBalanca(posPatch.itens));
console.log("\n--- APÓS PATCH NCM (pré-confirmação) ---");
console.log(JSON.stringify({ totalBRL: totalBrl(posPatch), item: posPatchItem }, null, 2));

const conf = await api("POST", `/api/cotacoes/${COT_ID}/itens/${ordem}/confirmar-ncm`, {
  confirmadoPor: "proof-ncm-individual@45957d9",
});
if (!conf.ok) throw new Error(`confirmar-ncm falhou: ${conf.status} ${conf.text.slice(0, 300)}`);

const depois = conf.json;
const depoisItem = snapItem(findBalanca(depois.itens));
const depoisTotal = totalBrl(depois);
console.log("\n--- DEPOIS (confirmação INDIVIDUAL + recálculo) ---");
console.log(JSON.stringify({ totalBRL: depoisTotal, item: depoisItem }, null, 2));

const fobOk =
  depoisItem.fobKgPlanilha != null && Math.abs(depoisItem.fobKgPlanilha - FOB_KG_ESPERADO) <= TOL_FOB;
const fobMudou =
  antesItem.fobKgPlanilha != null &&
  depoisItem.fobKgPlanilha != null &&
  Math.abs(antesItem.fobKgPlanilha - depoisItem.fobKgPlanilha) > 0.01;
const ncmOk = depoisItem.ncm === NCM_CERTO;
const confirmOk = depoisItem.ncmRevisadoHumano === true;
const totalMudou = Math.abs((antesTotal ?? 0) - (depoisTotal ?? 0)) > 0.01;

console.log("\n--- CHECKLIST confirmação individual ---");
console.log(`NCM ${NCM_CERTO}: ${ncmOk ? "OK" : "FAIL"}`);
console.log(
  `FOB/kg planilha ≈ ${FOB_KG_ESPERADO}: ${fobOk ? "OK" : "FAIL"} (${antesItem.fobKgPlanilha} → ${depoisItem.fobKgPlanilha})`,
);
console.log(`FOB/kg planilha mudou: ${fobMudou ? "OK" : "FAIL"}`);
console.log(`II: ${antesItem.ii} → ${depoisItem.ii}`);
console.log(`IPI: ${antesItem.ipi} → ${depoisItem.ipi}`);
console.log(`Total: ${antesTotal} → ${depoisTotal} (${totalMudou ? "ajustou" : "igual"})`);
console.log(`Confirmação humana: ${confirmOk ? "OK" : "FAIL"}`);

// Cache humano — mesma descOriginal da linha
const descCache = depoisItem.descOriginal ?? "HY-97 — 挂钩秤";
console.log("\n=== Nova classificação (cache humano) ===");
console.log(`descOriginal cache key: ${descCache}`);
const classif = await api("POST", "/api/classificar", {
  linhas: [{ descOriginal: descCache, material: balanca.material, uso: balanca.uso, ncm: "" }],
});
const hit = classif.json?.itens?.[0];
console.log(
  JSON.stringify(
    {
      ncm: (hit?.ncm ?? "").replace(/\D/g, ""),
      ncmClassificacaoCache: hit?.ncmClassificacaoCache,
      ncmFonte: hit?.ncmFonte,
      classificacaoCache: classif.json?.classificacaoCache,
    },
    null,
    2,
  ),
);
const cacheOk = hit?.ncmClassificacaoCache === "humano" && (hit?.ncm ?? "").replace(/\D/g, "") === NCM_CERTO;
console.log(`Badge cache humano (API): ${cacheOk ? "OK" : "FAIL"}`);

const pass = ncmOk && fobOk && fobMudou && confirmOk && cacheOk;
console.log(pass ? "\nPASS proof-ncm-confirm-individual-cot72" : "\nFAIL proof-ncm-confirm-individual-cot72");
process.exit(pass ? 0 : 1);
