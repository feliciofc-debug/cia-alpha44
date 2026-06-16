#!/usr/bin/env node
/**
 * Repro PATCH NCM sequencial (DESTRUTIVO — alterna 8711↔9617 nas ordens 0-4).
 *
 * NUNCA rode contra planilha-armadilha de inspeção. Use cotação sandbox descartável.
 *
 *   SMOKE_DESTRUCTIVE=1 node tools/repro-alterar-ncm.mjs <COTACAO_ID>
 *   SMOKE_API=http://127.0.0.1:3333 node tools/repro-alterar-ncm.mjs <id>  # dev local
 */
import { createClerkClient } from "@clerk/backend";
import { exigirCotacaoExplicita, exigirMutacaoAutorizada } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "http://127.0.0.1:3333";
const COT = exigirCotacaoExplicita(process.argv[2] ?? process.env.SMOKE_COT, "repro-alterar-ncm");
exigirMutacaoAutorizada(API, COT, "repro-alterar-ncm");

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const users = await clerk.users.getUserList({ limit: 1 });
const uid = users.data[0]?.id;
const sessions = await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 });
let sid = sessions.data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;

async function patch(ordem, ncm) {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/cotacoes/${COT}/itens/${ordem}/ncm`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
    body: JSON.stringify({ ncm }),
  });
  const ms = Date.now() - t0;
  const txt = await res.text();
  return { ordem, ncm, status: res.status, ms, ok: res.ok, body: txt.slice(0, 80) };
}

console.warn(`⚠ repro-alterar-ncm DESTRUTIVO · cotação=${COT} · API=${API}\n`);

console.log("=== 1) Sequencial ordens 0-4 (NCM alternado 8711↔9617) ===");
for (let o = 0; o < 5; o++) {
  const ncm = o % 2 === 0 ? "87116000" : "96170010";
  const r = await patch(o, ncm);
  console.log(`  ordem=${o} status=${r.status} ${r.ms}ms ${r.ok ? "OK" : "FAIL"}`);
}

console.log("\n=== 2) Item 13 — mesmo NCM 73269090 ===");
for (let i = 0; i < 3; i++) {
  const r = await patch(13, "73269090");
  console.log(`  tentativa ${i + 1}: status=${r.status} ${r.ms}ms`);
}

console.log("\n=== 3) Item 13 — NCM 72104900 ===");
const r72 = await patch(13, "72104900");
console.log(`  status=${r72.status} ${r72.ms}ms body=${r72.body}`);

console.log("\n=== 4) Paralelo 3x item 13 ===");
const par = await Promise.all([
  patch(13, "73269090"),
  patch(13, "73269090"),
  patch(13, "73269090"),
]);
for (const r of par) console.log(`  status=${r.status} ${r.ms}ms`);
