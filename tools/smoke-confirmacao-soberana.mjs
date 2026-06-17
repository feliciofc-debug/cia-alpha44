#!/usr/bin/env node
/** Smoke — confirmação soberana + PDF canários. */
import { createClerkClient } from "@clerk/backend";
import {
  confirmacaoNcmVigente,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  metaConfirmacaoNcm,
} from "@cia/shared";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_SIM_CHINA = "cmqgy89om000ykwaz7cd24o0a";
const COT_AZEITE = "cmqgrmhbt000vkwarr0ve3c4e";
const COT_FILTRO = "cmqgl0qip0054kwwnffs8mq9n";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);
const ctx = criarPdfNcmAuditCtx(criarNcmCatalog(loadNcmVigente()));

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;
const auth = { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" };

async function getCot(id) {
  const r = await fetch(`${API}/api/cotacoes/${id}`, { headers: auth });
  return r.json();
}

async function pdfStatus(id) {
  const r = await fetch(`${API}/api/cotacoes/${id}/pdf?tipo=cliente`, { headers: auth });
  return { status: r.status, ok: r.ok };
}

async function confirmar(cotId, ordem) {
  const r = await fetch(`${API}/api/cotacoes/${cotId}/itens/${ordem}/confirmar-ncm`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ confirmadoPor: "smoke-confirmacao-soberana" }),
  });
  return { status: r.status, body: r.ok ? await r.json() : await r.text() };
}

const checks = [];

// Invariante sintética whisky/chá
for (const [nome, ncm] of [
  ["whisky", "22083020"],
  ["cha", "09023000"],
]) {
  const it = {
    descPt: nome,
    ncm,
    ncmValido: false,
    compatibilidadeProduto: "revisar",
    ...metaConfirmacaoNcm(ncm),
  };
  checks.push([
    `sintetico_${nome}_nao_bloqueia`,
    confirmacaoNcmVigente(it) && !itemBloqueiaPdfNcm(it, ctx) && !itemPrecisaResolucaoNcm(it, ctx),
  ]);
}

// sim-china PDF 200
const p1 = await pdfStatus(COT_SIM_CHINA);
checks.push(["sim_china_pdf_200", p1.status === 200]);

// Canários
for (const [nome, id] of [
  ["azeite", COT_AZEITE],
  ["filtro", COT_FILTRO],
]) {
  const p = await pdfStatus(id);
  checks.push([`${nome}_pdf_200`, p.status === 200]);
}

// Confirmar 1º item bloqueador em cotação com pendência (se houver)
const china = await getCot(COT_SIM_CHINA);
const bloqueador = (china.itens ?? []).find((it) => itemBloqueiaPdfNcm(it, ctx) && !confirmacaoNcmVigente(it));
if (bloqueador) {
  const c = await confirmar(COT_SIM_CHINA, bloqueador.ordem);
  const dep = c.body?.itens?.find((i) => i.ordem === bloqueador.ordem);
  checks.push(["confirm_api_200", c.status === 200]);
  checks.push(["confirm_destrava", dep ? confirmacaoNcmVigente(dep) && !itemBloqueiaPdfNcm(dep, ctx) : false]);
} else {
  checks.push(["confirm_api_200", true]);
  checks.push(["confirm_destrava", true]);
}

console.log("=== RESULTADO ===");
let fail = 0;
for (const [n, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${n}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
