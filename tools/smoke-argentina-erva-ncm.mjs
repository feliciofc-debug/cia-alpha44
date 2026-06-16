#!/usr/bin/env node
/**
 * Smoke pós-fix idx/ordem: Argentina erva-mate — alterar NCM, confirmar, PDF.
 *
 * Uso (prod):
 *   SMOKE_DESTRUCTIVE=1 CLERK_SECRET_KEY=... node tools/smoke-argentina-erva-ncm.mjs
 *   SMOKE_DESTRUCTIVE=1 SMOKE_COT=<id> ...  # cotação explícita
 */
import { createClerkClient } from "@clerk/backend";
import { exigirMutacaoAutorizada } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const NCM_ALVO = "09030090";
const NCM_ANTES_ESPERADO = /09096110|09030090/;

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

function itemBloqueiaPdfNcm(it) {
  const key = ncm8(it.ncm);
  if (!key || key === "00000000") return true;
  if (it.ncmRevisadoHumano && it.ncmConfirmado && ncm8(it.ncm) === ncm8(it.ncmConfirmado)) return false;
  if (it.compatibilidadeProduto === "incompativel") return true;
  if (it.compatibilidadeProduto === "revisar") return true;
  if (it.ncmValido === false) return true;
  return false;
}

async function getJson(path, headers) {
  const res = await fetch(`${API}${path}`, { headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  return body;
}

async function resolveCotacaoId(headers) {
  if (process.env.SMOKE_COT?.trim()) return process.env.SMOKE_COT.trim();
  const lista = await getJson("/api/cotacoes", headers);
  const rows = Array.isArray(lista) ? lista : lista.cotacoes ?? [];
  const match = rows.find(
    (c) =>
      /argentina/i.test(c.cliente ?? "") ||
      /argentina/i.test(c.origem ?? "") ||
      /argentina/i.test(c.destino ?? ""),
  );
  if (!match?.id) throw new Error("Cotação Argentina não encontrada — defina SMOKE_COT");
  return match.id;
}

function acharErvaMate(itens) {
  for (const [idx, it] of itens.entries()) {
    const desc = `${it.descPt ?? ""} ${it.descOriginal ?? ""}`;
    if (/erva.?mate/i.test(desc)) {
      return { idx, ordem: it.ordem ?? idx, item: it, desc: desc.trim().slice(0, 60) };
    }
  }
  return null;
}

if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error("CLERK_SECRET_KEY obrigatório");
  process.exit(2);
}

const headers = await authHeaders();
const cotId = await resolveCotacaoId(headers);
exigirMutacaoAutorizada(API, cotId, "smoke-argentina-erva-ncm");

console.log(`\n=== smoke-argentina-erva-ncm ===`);
console.log(`API: ${API}`);
console.log(`Cotação: ${cotId}\n`);

let det = await getJson(`/api/cotacoes/${cotId}`, headers);
const erva = acharErvaMate(det.itens ?? []);
if (!erva) {
  console.error("Erva-mate não encontrada na cotação");
  process.exit(1);
}

console.log("--- Diagnóstico pré-mutação ---");
console.log(`Erva-mate: idxArray=${erva.idx} ordem=${erva.ordem} ncm=${ncm8(erva.item.ncm)}`);
console.log(`Diverge idx≠ordem: ${erva.idx !== erva.ordem ? "SIM ← bug histórico" : "não"}`);
console.log(`Desc: ${erva.desc}`);

const ordemApi = erva.ordem;
console.log(`\n--- PATCH /itens/${ordemApi}/ncm → ${NCM_ALVO} ---`);
const patchRes = await fetch(`${API}/api/cotacoes/${cotId}/itens/${ordemApi}/ncm`, {
  method: "PATCH",
  headers,
  body: JSON.stringify({ ncm: NCM_ALVO }),
});
const patchBody = await patchRes.json().catch(() => ({}));
if (!patchRes.ok) {
  console.error(`PATCH falhou: ${patchRes.status}`, patchBody);
  process.exit(1);
}

det = patchBody;
const ervaPos = acharErvaMate(det.itens ?? []);
const ncmPos = ncm8(ervaPos?.item?.ncm);
const trocou = ncmPos === NCM_ALVO;
console.log(`GET implícito pós-PATCH: ncm=${ncmPos} ${trocou ? "OK ✓" : "FAIL ✗ (esperado " + NCM_ALVO + ")"}`);

det = await getJson(`/api/cotacoes/${cotId}`, headers);
const ervaGet = acharErvaMate(det.itens ?? []);
const ncmGet = ncm8(ervaGet?.item?.ncm);
console.log(`GET explícito: ncm=${ncmGet} ${ncmGet === NCM_ALVO ? "OK ✓" : "FAIL ✗"}`);

console.log(`\n--- POST /itens/${ordemApi}/confirmar-ncm ---`);
const confRes = await fetch(`${API}/api/cotacoes/${cotId}/itens/${ordemApi}/confirmar-ncm`, {
  method: "POST",
  headers,
  body: JSON.stringify({ confirmadoPor: "smoke-argentina-erva" }),
});
const confBody = await confRes.json().catch(() => ({}));
if (!confRes.ok) {
  console.error(`Confirmar falhou: ${confRes.status}`, confBody);
  process.exit(1);
}

const bloqueando = (confBody.itens ?? []).filter(itemBloqueiaPdfNcm).length;
console.log(`itensBloqueandoPdf: ${bloqueando} ${bloqueando === 0 ? "OK ✓" : "FAIL ✗"}`);

console.log(`\n--- GET PDF cliente ---`);
const pdfRes = await fetch(`${API}/api/cotacoes/${cotId}/pdf?tipo=cliente`, {
  headers: { Authorization: headers.Authorization },
});
const pdfOk = pdfRes.ok && (pdfRes.headers.get("content-type") ?? "").includes("pdf");
console.log(`PDF: HTTP ${pdfRes.status} ${pdfOk ? "OK ✓" : "FAIL ✗"}`);

const pass = trocou && ncmGet === NCM_ALVO && bloqueando === 0 && pdfOk;
console.log(`\n=== ${pass ? "VERDE ✅" : "VERMELHO ❌"} ===`);
console.log(`Resumo erva-mate: idx=${erva.idx} ordem=${erva.ordem}\n`);
process.exit(pass ? 0 : 1);
