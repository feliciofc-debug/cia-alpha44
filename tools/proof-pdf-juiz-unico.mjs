#!/usr/bin/env node
/** Prova juiz único — gate local na cotação sim-china → PDF 200. */
import { createClerkClient } from "@clerk/backend";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { auditarItemNcmParaPdf, itemBloqueiaPdfNcm } from "@cia/shared";

const COT = process.argv[2] ?? "cmqgy89om000ykwaz7cd24o0a";
const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);
const { auditarNcmsParaPdf } = await import(
  pathToFileURL(join(root, "apps/api/dist/services/validar-ncm-pdf.js")).href,
);
const catalog = criarNcmCatalog(loadNcmVigente());
const ctx = criarPdfNcmAuditCtx(catalog);

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;

const getRes = await fetch(`${API}/api/cotacoes/${COT}`, { headers: { Authorization: `Bearer ${jwt}` } });
const cotacao = await getRes.json();
const itens = cotacao.itens ?? [];

const bloqueadores = itens.filter((it) => itemBloqueiaPdfNcm(it, ctx));
console.log("=== Gate juiz único (local) ===");
console.log(`Itens: ${itens.length} | Bloqueadores: ${bloqueadores.length}`);
for (const it of bloqueadores) {
  const a = auditarItemNcmParaPdf(it, ctx);
  console.log(`  #${it.ordem} ${(it.descPt || "").slice(0, 50)} → ${a.motivo}`);
}

try {
  auditarNcmsParaPdf(itens, catalog);
  console.log("auditarNcmsParaPdf: OK (sem 422)");
} catch (e) {
  console.log("auditarNcmsParaPdf: 422", e.message);
  process.exit(1);
}

const pdfRes = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
console.log(`\nPDF prod HTTP: ${pdfRes.status} (esperado 200 após deploy do gate)`);
if (pdfRes.status === 200) {
  const buf = Buffer.from(await pdfRes.arrayBuffer());
  console.log(JSON.stringify({ status: 200, bytes: buf.length, isPdf: buf.slice(0, 4).toString() === "%PDF" }));
}
