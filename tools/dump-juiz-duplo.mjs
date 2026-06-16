#!/usr/bin/env node
/** Dump Passo 1 — juiz duplo (prod) vs juiz único (local). */
import { createClerkClient } from "@clerk/backend";
import { auditarItemNcmParaPdf, itemBloqueiaPdfNcm } from "@cia/shared";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqgy89om000ykwaz7cd24o0a";
const ALVOS = /carrinho|trena|chave de fenda|camiseta/i;

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

const getRes = await fetch(`${API}/api/cotacoes/${COT}`, { headers: { Authorization: `Bearer ${jwt}` } });
const cotacao = await getRes.json();
const itens = (cotacao.itens ?? []).filter((i) => ALVOS.test(i.descPt || i.descOriginal || ""));

console.log(`cotacaoId: ${COT}\n=== PASSO 1 — DUMP (4 itens) ===\n`);
for (const it of itens) {
  const auditNovo = auditarItemNcmParaPdf(it, ctx);
  console.log(JSON.stringify({
    desc: (it.descPt || it.descOriginal || "").slice(0, 70),
    ncm: it.ncm,
    ncmValido: it.ncmValido,
    compatibilidadeProduto: it.compatibilidadeProduto,
    ncmFonte: it.ncmFonte,
    pdfNcmAudit_prod: it.pdfNcmAudit,
    bloqueia_prod: it.pdfNcmAudit?.bloqueia,
    bloqueia_juiz_unico: auditNovo.bloqueia,
    itemBloqueia_juiz_unico: itemBloqueiaPdfNcm(it, ctx),
    raiz: it.compatibilidadeProduto === "compativel" && it.pdfNcmAudit?.bloqueia ? "SIM — compatível bloqueado por validarNcm legado" : "não",
  }, null, 2));
  console.log("---");
}

const pdfRes = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
console.log(`\nPDF prod (gate legado): HTTP ${pdfRes.status}`);
