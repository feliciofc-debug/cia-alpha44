#!/usr/bin/env node
/**
 * Smoke: conciliação DIVERGENTE (mate NCM 21012010 vs IA 09030090) + PDF ainda 200.
 *
 * VPS:
 *   SMOKE_DESTRUCTIVE=1 set -a && source /etc/cia-alpha44/api.env && set +a &&
 *   node tools/smoke-ncm-divergente.mjs
 */
import { createClerkClient } from "@clerk/backend";
import { exigirMutacaoAutorizada } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const NCM_INFORMADO = "21012010";
const NCM_SUGERIDO_ESPERADO = "09030090";

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
  const users = await clerk.users.getUserList({ limit: 1 });
  const uid = users.data[0]?.id;
  if (!uid) throw new Error("Nenhum usuário Clerk");
  const sessions = await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 });
  let sid = sessions.data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const token = await clerk.sessions.getToken(sid, undefined, 3600);
  const jwt = typeof token === "string" ? token : token.jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

function ncm8(ncm) {
  return (ncm ?? "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

async function getJson(path, headers) {
  const res = await fetch(`${API}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

function acharMate(itens) {
  for (const [idx, it] of itens.entries()) {
    const desc = `${it.descPt ?? ""} ${it.descOriginal ?? ""} ${it.material ?? ""}`;
    if (/erva.?mate|\bmate\b/i.test(desc)) {
      return { idx, ordem: it.ordem ?? idx + 1, item: it, desc: desc.trim().slice(0, 80) };
    }
  }
  return null;
}

async function resolveCotacaoId(headers) {
  if (process.env.SMOKE_COT?.trim()) return process.env.SMOKE_COT.trim();
  const lista = await getJson("/api/cotacoes?limit=50", headers);
  const rows = Array.isArray(lista) ? lista : lista.cotacoes ?? [];
  for (const c of rows) {
    const det = await getJson(`/api/cotacoes/${c.id}`, headers);
    if (acharMate(det.itens ?? [])) return c.id;
  }
  throw new Error("Nenhuma cotação com erva-mate — defina SMOKE_COT");
}

if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error("CLERK_SECRET_KEY obrigatório");
  process.exit(2);
}

const headers = await authHeaders();
const cotId = await resolveCotacaoId(headers);
exigirMutacaoAutorizada(API, cotId, "smoke-ncm-divergente");

console.log(`\n=== smoke-ncm-divergente ===`);
console.log(`API: ${API}`);
console.log(`Cotação: ${cotId}\n`);

let det = await getJson(`/api/cotacoes/${cotId}`, headers);
let mate = acharMate(det.itens ?? []);
if (!mate) {
  console.error("Erva-mate não encontrada");
  process.exit(1);
}

const ordemApi = mate.ordem >= 1 ? mate.ordem : mate.idx + 1;
console.log(`Item mate: ordem=${ordemApi} ncmAtual=${ncm8(mate.item.ncm)}`);
console.log(`Desc: ${mate.desc}\n`);

if (ncm8(mate.item.ncm) !== NCM_INFORMADO) {
  console.log(`--- PATCH /itens/${ordemApi}/ncm → ${NCM_INFORMADO} ---`);
  const patchRes = await fetch(`${API}/api/cotacoes/${cotId}/itens/${ordemApi}/ncm`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ ncm: NCM_INFORMADO }),
  });
  const patchBody = await patchRes.json().catch(() => ({}));
  if (!patchRes.ok) {
    console.error(`PATCH falhou: ${patchRes.status}`, patchBody);
    process.exit(1);
  }
  det = patchBody;
  mate = acharMate(det.itens ?? []);
  console.log(`NCM após PATCH: ${ncm8(mate?.item?.ncm)} ${ncm8(mate?.item?.ncm) === NCM_INFORMADO ? "OK" : "FAIL"}\n`);
}

det = await getJson(`/api/cotacoes/${cotId}`, headers);
mate = acharMate(det.itens ?? []);
console.log(`--- POST /itens/${ordemApi}/conciliar-ncm ---`);
const concRes = await fetch(`${API}/api/cotacoes/${cotId}/itens/${ordemApi}/conciliar-ncm`, {
  method: "POST",
  headers,
  body: JSON.stringify({}),
});
const concBody = await concRes.json().catch(() => ({}));
console.log(`HTTP ${concRes.status}`);
console.log(JSON.stringify(concBody, null, 2));

const divergenteOk =
  concRes.ok &&
  concBody.ok === true &&
  concBody.status === "divergente" &&
  ncm8(concBody.ncmInformado) === NCM_INFORMADO &&
  ncm8(concBody.ncmSugerido) === NCM_SUGERIDO_ESPERADO;

console.log(`\nConciliação divergente: ${divergenteOk ? "OK ✓" : "FAIL ✗"}`);

console.log(`\n--- GET /api/cotacoes/${cotId}/pdf?tipo=cliente ---`);
const pdfGet = await fetch(`${API}/api/cotacoes/${cotId}/pdf?tipo=cliente`, {
  headers: { Authorization: headers.Authorization },
});
const pdfGetType = pdfGet.headers.get("content-type") ?? "";
console.log(`GET PDF: HTTP ${pdfGet.status} · Content-Type: ${pdfGetType}`);
if (!pdfGet.ok) {
  const errText = await pdfGet.text();
  console.log(errText.slice(0, 500));
}

console.log(`\n--- POST /api/cotacoes/preview-pdf (mesma cotação) ---`);
const pdfPost = await fetch(`${API}/api/cotacoes/preview-pdf?tipo=cliente`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    cotacao: det.cotacao ?? det,
    itens: det.itens ?? [],
    resultado: det.resultado ?? null,
  }),
});
const pdfPostType = pdfPost.headers.get("content-type") ?? "";
console.log(`POST PDF: HTTP ${pdfPost.status} · Content-Type: ${pdfPostType}`);
if (!pdfPost.ok) {
  const errText = await pdfPost.text();
  console.log(errText.slice(0, 500));
}

const pdfOk =
  pdfGet.ok &&
  pdfGetType.includes("pdf") &&
  pdfPost.ok &&
  pdfPostType.includes("pdf");

console.log(`\nPDF não bloqueado: ${pdfOk ? "OK ✓" : "FAIL ✗"}`);
console.log(`\n=== ${divergenteOk && pdfOk ? "PASS" : "FAIL"} ===\n`);
process.exit(divergenteOk && pdfOk ? 0 : 1);
