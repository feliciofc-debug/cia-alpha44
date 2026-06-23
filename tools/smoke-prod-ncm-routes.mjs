#!/usr/bin/env node
/** Smoke rotas NCM conciliação em produção (VPS: source api.env && node tools/smoke-prod-ncm-routes.mjs) */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const users = await clerk.users.getUserList({ limit: 1 });
const uid = users.data[0]?.id;
if (!uid) throw new Error("Nenhum usuário Clerk");
let sessions = await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 });
let sid = sessions.data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;
const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

async function show(method, path, body) {
  const opts = { method, headers: { Authorization: h.Authorization } };
  if (body !== undefined) {
    opts.headers["content-type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(`${API}${path}`, opts);
  const text = await r.text();
  console.log(`\n=== ${method} ${path} ===`);
  console.log(`HTTP ${r.status}`);
  console.log(text.slice(0, 800));
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: r.status, ok: r.ok, json };
}

await show("GET", "/api/ncm/lookup");
const lookupPost = await show("POST", "/api/ncm/lookup", { ncm: "22085000" });

const list = await fetch(`${API}/api/cotacoes?limit=10`, { headers: h }).then((r) => r.json());
const rows = list.cotacoes ?? list.items ?? (Array.isArray(list) ? list : []);
const cot = rows.find((c) => (c.itensCount ?? c.totalItens ?? 0) > 0) ?? rows[0];
const cotId = cot?.id ?? cot?.cotacaoId;
if (!cotId) {
  console.log("\nSKIP conciliar-ncm — nenhuma cotação listada");
  process.exit(lookupPost.status === 200 ? 0 : 1);
}

const det = await fetch(`${API}/api/cotacoes/${cotId}`, { headers: h }).then((r) => r.json());
const item0 = det.itens?.find((it) => (it.ordem ?? 0) >= 1) ?? det.itens?.[0];
const ordem = item0?.ordem ?? 1;
console.log(`\nCotação teste: ${cotId} · ordem ${ordem}`);

await show("GET", `/api/cotacoes/${cotId}/itens/${ordem}/conciliar-ncm`);
const conciliarPost = await show("POST", `/api/cotacoes/${cotId}/itens/${ordem}/conciliar-ncm`, {});

const lookupBody = lookupPost.json;
const conciliarBody = conciliarPost.json;

const ok =
  lookupPost.ok && conciliarPost.ok && lookupBody?.ok !== false && conciliarBody?.ok !== false;
console.log(ok ? "\nPASS prod NCM routes" : "\nFAIL prod NCM routes");
process.exit(ok ? 0 : 1);
