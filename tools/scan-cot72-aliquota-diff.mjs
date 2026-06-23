#!/usr/bin/env node
/** Escaneia cotação 72 (multi-item) e TEC — acha item candidato a prova de recálculo de imposto. */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2];

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

async function lookupNcm(h, ncm) {
  const r = await fetch(`${API}/api/ncm/lookup`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ ncm }),
  });
  return r.json();
}

async function listCotacoes72(h) {
  const list = await fetch(`${API}/api/cotacoes?limit=50`, { headers: h }).then((r) => r.json());
  const rows = list.cotacoes ?? list;
  return rows.filter((c) => /72/i.test(c.cliente ?? "") || /72/i.test(c.empresaTrade ?? ""));
}

/** Pares conhecidos onde IA pode errar e alíquotas divergem (família vs subitem). */
const PARES_CANDIDATOS = [
  { errado: "84238900", certo: "84233090", label: "balança gancho" },
  { errado: "94051190", certo: "94052100", label: "luminária LED" },
  { errado: "94051100", certo: "94052100", label: "luminária" },
  { errado: "85287200", certo: "85285900", label: "monitor/TV" },
  { errado: "84713012", certo: "84714100", label: "notebook/tablet" },
  { errado: "73181500", certo: "73182100", label: "parafuso/porca" },
  { errado: "19011020", certo: "19011090", label: "farinha" },
];

const h = await authHeaders();
const aliqCache = new Map();

async function aliq(ncm) {
  const k = ncm.replace(/\D/g, "");
  if (aliqCache.has(k)) return aliqCache.get(k);
  const r = await lookupNcm(h, k);
  const a = { ii: r?.aliquotas?.ii ?? r?.ii, ipi: r?.aliquotas?.ipi ?? r?.ipi, ok: r?.ok !== false };
  aliqCache.set(k, a);
  return a;
}

function diverge(a, b) {
  if (!a?.ok || !b?.ok) return false;
  return Math.abs((a.ii ?? 0) - (b.ii ?? 0)) > 0.0001 || Math.abs((a.ipi ?? 0) - (b.ipi ?? 0)) > 0.0001;
}

console.log("=== Pares NCM com alíquotas diferentes (TEC prod) ===");
for (const p of PARES_CANDIDATOS) {
  const ae = await aliq(p.errado);
  const ac = await aliq(p.certo);
  const div = diverge(ae, ac);
  console.log(
    `${p.label}: ${p.errado} (II=${((ae.ii ?? 0) * 100).toFixed(2)}% IPI=${((ae.ipi ?? 0) * 100).toFixed(2)}%) → ${p.certo} (II=${((ac.ii ?? 0) * 100).toFixed(2)}% IPI=${((ac.ipi ?? 0) * 100).toFixed(2)}%) ${div ? "★ DIVERGE" : "igual"}`,
  );
}

let cotId = COT_ID;
if (!cotId) {
  const cots = await listCotacoes72(h);
  console.log("\n=== Cotações 72 ===");
  for (const c of cots) {
    const det = await fetch(`${API}/api/cotacoes/${c.id}`, { headers: h }).then((r) => r.json());
    console.log(`${c.id} | ${c.cliente} | itens=${det.itens?.length ?? "?"}`);
  }
  cotId = cots.find((c) => !/teste/i.test(c.cliente ?? ""))?.id ?? cots.sort((a, b) => (b.itensCount ?? 0) - (a.itensCount ?? 0))[0]?.id;
}

if (!cotId) {
  console.error("Nenhuma cotação 72");
  process.exit(1);
}

const det = await fetch(`${API}/api/cotacoes/${cotId}`, { headers: h }).then((r) => r.json());
console.log(`\n=== Scan ${cotId} (${det.cliente}) — ${det.itens?.length} itens ===`);
console.log(`totalBRL=${det.financeiro?.totalBRL ?? det.totalBRL}`);

const candidatos = [];
for (const it of det.itens ?? []) {
  const ncm = (it.ncm ?? "").replace(/\D/g, "");
  const aAtual = await aliq(ncm);
  for (const p of PARES_CANDIDATOS) {
    if (ncm !== p.errado && ncm !== p.certo) continue;
    const alvo = ncm === p.errado ? p.certo : p.errado;
    const aAlvo = await aliq(alvo);
    if (!diverge(aAtual, aAlvo)) continue;
    const fob = it.fobEmbarqueUS ?? it.fobTotalUS ?? 0;
    candidatos.push({
      ordem: it.ordem,
      desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 50),
      ncmAtual: ncm,
      ncmAlvo: alvo,
      iiAtual: aAtual.ii,
      ipiAtual: aAtual.ipi,
      iiAlvo: aAlvo.ii,
      ipiAlvo: aAlvo.ipi,
      fobUS: fob,
      peso: it.pesoLiqKg,
      par: p.label,
      ncmRevisadoHumano: it.ncmRevisadoHumano,
    });
  }
}

candidatos.sort((a, b) => b.fobUS - a.fobUS);
console.log("\n=== Candidatos (alíquota diferente + FOB relevante) ===");
console.log(JSON.stringify(candidatos.slice(0, 10), null, 2));
if (candidatos[0]) {
  console.log(`\nMELHOR: ordem=${candidatos[0].ordem} ${candidatos[0].par} ${candidatos[0].ncmAtual}→${candidatos[0].ncmAlvo}`);
}
