#!/usr/bin/env node
/** Smoke pós-deploy: lote NCM na cotação armadilha (VPS: source api.env && node tools/smoke-pos-deploy-ncm.mjs) */
import { createClerkClient } from "@clerk/backend";
import { exigirCotacaoExplicita, exigirMutacaoAutorizada } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = exigirCotacaoExplicita(process.env.SMOKE_COT, "smoke-pos-deploy-ncm");
exigirMutacaoAutorizada(API, COT, "smoke-pos-deploy-ncm");

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const users = await clerk.users.getUserList({ limit: 1 });
const uid = users.data[0]?.id;
const sessions = await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 });
let sid = sessions.data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;

const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

function elegivel(it) {
  if (it.compatibilidadeProduto === "incompativel") return false;
  if (it.ncmRevisadoHumano && it.ncmConfirmado === (it.ncm || "").replace(/\D/g, "").padStart(8, "0")) return false;
  const ncm = (it.ncm || "").replace(/\D/g, "").padStart(8, "0").slice(0, 8);
  if (!ncm || ncm === "00000000") return false;
  if (it.compatibilidadeProduto === "revisar") return true;
  if (it.ncmValido === false) return true;
  if (it.ncmFonte === "pendente") return true;
  if (it.ncmConfianca != null && it.ncmConfianca < 0.85) return true;
  return false;
}

const det = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());
const itens = det.itens ?? [];
const elegAntes = itens.filter(elegivel).length;
const confAntes = itens.filter((it) => it.ncmRevisadoHumano).length;
console.log(`GET ${COT}: ${itens.length} itens · ${elegAntes} elegíveis · ${confAntes} confirmados`);

const t0 = Date.now();
const res = await fetch(`${API}/api/cotacoes/${COT}/itens/confirmar-ncm-lote`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ confirmadoPor: "smoke-pos-deploy" }),
});
const ms = Date.now() - t0;
const body = await res.json();
console.log(`POST lote: HTTP ${res.status} em ${ms}ms · aprovados=${body.aprovados} pulados=${body.pulados} pendentes=${body.pendentes}`);

const det2 = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());
const itens2 = det2.itens ?? [];
const confDepois = itens2.filter((it) => it.ncmRevisadoHumano).length;
const pendDepois = itens2.filter((it) => !it.ncmRevisadoHumano && elegivel(it)).length;
console.log(`Pós-lote: ${confDepois} confirmados · ${pendDepois} ainda elegíveis`);

const ok = res.ok && typeof body.aprovados === "number";
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
