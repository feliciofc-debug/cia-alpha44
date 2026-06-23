#!/usr/bin/env node
/**
 * Prova final: confirmação individual move IMPOSTOS quando NCM novo tem alíquota diferente.
 * Escolhe automaticamente o melhor item da cotação 72 multi-item.
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

const PARES = [
  { certo: "84732910", errado: "84798999", label: "lixador calosidades" },
  { certo: "42029200", errado: "42022210", label: "cabide dobrável" },
  { certo: "84512100", errado: "84501100", label: "secadora doméstica" },
  { certo: "85163200", errado: "85163100", label: "escova alisadora" },
  { certo: "69022010", errado: "69120000", label: "silicone cozinha" },
  { certo: "82041200", errado: "73181500", label: "chave porcas" },
  { certo: "84798999", errado: "85437099", label: "aparelho estética" },
];

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

function itemOrdem(c, ordem) {
  return c?.itens?.find((it) => (it.ordem ?? -1) === ordem);
}

function snap(it) {
  if (!it) return null;
  return {
    ncm: (it.ncm ?? "").replace(/\D/g, ""),
    ii: it.aliquotas?.ii,
    ipi: it.aliquotas?.ipi,
    fobKgPlanilha: it.calibracao?.fobKgCalibrado ?? it.benchmark?.fobKgMedioDI,
    ncmRevisadoHumano: it.ncmRevisadoHumano,
  };
}

async function escolherCenario(det) {
  for (const par of PARES) {
    const hit = det.itens.find((it) => {
      const n = (it.ncm ?? "").replace(/\D/g, "");
      return n === par.certo || n === par.errado;
    });
    if (!hit) continue;
    const ordem = hit.ordem ?? det.itens.indexOf(hit);
    const ncmAtual = (hit.ncm ?? "").replace(/\D/g, "");
    const errado = par.errado;
    const certo = par.certo;
    const fob = hit.fobEmbarqueUS ?? hit.fobTotalUS ?? 0;
    return { ordem, par, errado, certo, ncmAtual, fob, desc: hit.descPt ?? hit.descOriginal };
  }
  return null;
}

async function resetItem(ordem, errado) {
  const det0 = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
  const it = itemOrdem(det0, ordem);
  if (it?.ncmRevisadoHumano) {
    await api("POST", `/api/cotacoes/${COT_ID}/itens/${ordem}/desfazer-ncm`, {});
  }
  const ncm = (itemOrdem((await api("GET", `/api/cotacoes/${COT_ID}`)).json, ordem)?.ncm ?? "").replace(/\D/g, "");
  if (ncm !== errado) {
    const p = await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ordem}/ncm`, { ncm: errado });
    if (!p.ok) throw new Error(`reset PATCH ${errado} falhou: ${p.status}`);
  }
  return (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
}

console.log("=== PROVA recálculo de IMPOSTO — confirmação individual (cot 72 multi-item) ===");
console.log(`API: ${API} | Cotação: ${COT_ID}`);

let det = (await api("GET", `/api/cotacoes/${COT_ID}`)).json;
console.log(`Itens: ${det.itens?.length} | Total inicial: ${totalBrl(det)}`);

let cenario = await escolherCenario(det);
if (!cenario) throw new Error("Nenhum par candidato encontrado nos itens");

// Se item está no NCM certo, invertemos: baseline = errado, correção = certo
let { ordem, par, errado, certo } = cenario;
console.log(`\nCenário: ordem=${ordem} (${par.label})`);
console.log(`  errado=${errado} → certo=${certo}`);
console.log(`  desc: ${(cenario.desc ?? "").slice(0, 60)}`);

det = await resetItem(ordem, errado);
const antesTotal = totalBrl(det);
const antesItem = snap(itemOrdem(det, ordem));
console.log("\n--- ANTES (NCM errado, sem confirmação) ---");
console.log(JSON.stringify({ totalBRL: antesTotal, item: antesItem }, null, 2));

const patch = await api("PATCH", `/api/cotacoes/${COT_ID}/itens/${ordem}/ncm`, { ncm: certo });
if (!patch.ok) throw new Error(`PATCH certo falhou: ${patch.status} ${patch.text.slice(0, 200)}`);
const posPatch = patch.json;
const posPatchItem = snap(itemOrdem(posPatch, ordem));
console.log("\n--- APÓS PATCH (pré-confirmação) ---");
console.log(JSON.stringify({ totalBRL: totalBrl(posPatch), item: posPatchItem }, null, 2));

const conf = await api("POST", `/api/cotacoes/${COT_ID}/itens/${ordem}/confirmar-ncm`, {
  confirmadoPor: "proof-ncm-aliquota@45957d9",
});
if (!conf.ok) throw new Error(`confirmar-ncm falhou: ${conf.status}`);

const depois = conf.json;
const depoisTotal = totalBrl(depois);
const depoisItem = snap(itemOrdem(depois, ordem));
console.log("\n--- DEPOIS (confirmação INDIVIDUAL) ---");
console.log(JSON.stringify({ totalBRL: depoisTotal, item: depoisItem }, null, 2));

const deltaTotal = depoisTotal - antesTotal;
const iiMudou = Math.abs((antesItem?.ii ?? 0) - (depoisItem?.ii ?? 0)) > 0.0001;
const ipiMudou = Math.abs((antesItem?.ipi ?? 0) - (depoisItem?.ipi ?? 0)) > 0.0001;
const totalMudou = Math.abs(deltaTotal) > 1;

console.log("\n--- CHECKLIST imposto ---");
console.log(`II: ${antesItem?.ii} → ${depoisItem?.ii} (${iiMudou ? "MUDOU" : "igual"})`);
console.log(`IPI: ${antesItem?.ipi} → ${depoisItem?.ipi} (${ipiMudou ? "MUDOU" : "igual"})`);
console.log(`Δ Total BRL: ${deltaTotal >= 0 ? "+" : ""}${deltaTotal.toFixed(2)} (${totalMudou ? "OK" : "FAIL"})`);
console.log(`Confirmação individual: ${depoisItem?.ncmRevisadoHumano ? "OK" : "FAIL"}`);

const pass = (iiMudou || ipiMudou) && totalMudou && depoisItem?.ncm === certo;
console.log(pass ? "\nPASS proof-ncm-aliquota-diff-cot72" : "\nFAIL proof-ncm-aliquota-diff-cot72");
process.exit(pass ? 0 : 1);
