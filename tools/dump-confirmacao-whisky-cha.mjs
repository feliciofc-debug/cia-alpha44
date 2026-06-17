#!/usr/bin/env node
/** Dump confirmação vs gate — whisky/chá UK. */
import { createClerkClient } from "@clerk/backend";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditarItemNcmParaPdf,
  confirmacaoNcmVigente,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  ncm8Limpo,
} from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2];

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);
const catalog = criarNcmCatalog(loadNcmVigente());
const ctx = criarPdfNcmAuditCtx(catalog);

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;
const auth = { Authorization: `Bearer ${jwt}` };

let cotId = COT;
if (!cotId) {
  const list = await (await fetch(`${API}/api/cotacoes?cliente=UK&limite=20`, { headers: auth })).json();
  const hit = (list.cotacoes ?? list).find?.((c) => /uk|whisky|UK-BEV/i.test(c.cliente + JSON.stringify(c)));
  cotId = hit?.id;
  if (!cotId) {
    const all = await (await fetch(`${API}/api/cotacoes?limite=50`, { headers: auth })).json();
    const rows = all.cotacoes ?? all;
    for (const c of rows) {
      const det = await (await fetch(`${API}/api/cotacoes/${c.id}`, { headers: auth })).json();
      if ((det.itens ?? []).some((i) => /whisky|UK-BEV-WHIS|22083020/i.test(i.descPt || i.descOriginal || ""))) {
        cotId = c.id;
        break;
      }
    }
  }
}
if (!cotId) throw new Error("Cotação UK não encontrada");

const cot = await (await fetch(`${API}/api/cotacoes/${cotId}`, { headers: auth })).json();
console.log(`cotacaoId: ${cotId} cliente: ${cot.cotacao?.cliente ?? cot.cliente}\n`);

const alvos = (cot.itens ?? []).filter((it) => {
  const o = it.ordem ?? 0;
  return o === 2 || o === 3 || /whisky|chá|tea|22083020|09023000/i.test(it.descPt || it.descOriginal || it.ncm || "");
});

for (const it of alvos) {
  const key = ncm8Limpo(it.ncm ?? "");
  const confKey = ncm8Limpo(it.ncmConfirmado ?? "");
  const vigente = confirmacaoNcmVigente(it);
  const audit = auditarItemNcmParaPdf(it, ctx);
  let porque = "";
  if (!vigente) {
    if (!it.ncmRevisadoHumano) porque = "ncmRevisadoHumano=false";
    else if (!it.ncmConfirmado) porque = "ncmConfirmado ausente";
    else if (key !== confKey) porque = `mismatch ncm8(${key}) !== ncmConfirmado(${confKey})`;
    else porque = "rastro incompleto";
  } else if (audit.bloqueia) {
    porque = `confirmado mas audit.bloqueia=true motivo=${audit.motivo}`;
  } else if (itemPrecisaResolucaoNcm(it, ctx)) {
    porque = "confirmado mas ainda na barra (precisaResolucao=true)";
  } else {
    porque = "OK — confirmado libera";
  }
  console.log(JSON.stringify({
    ordem: it.ordem,
    desc: (it.descPt || it.descOriginal || "").slice(0, 60),
    ncm: it.ncm,
    ncm8: key,
    ncmConfirmado: it.ncmConfirmado,
    ncmConfirmado8: confKey,
    ncmRevisadoHumano: it.ncmRevisadoHumano,
    ncmConfirmadoPor: it.ncmConfirmadoPor,
    ncmValido: it.ncmValido,
    compatibilidadeProduto: it.compatibilidadeProduto,
    confirmacaoNcmVigente: vigente,
    catalogExiste: catalog.existe(key),
    pdfNcmAudit: it.pdfNcmAudit,
    audit,
    itemBloqueia: itemBloqueiaPdfNcm(it, ctx),
    itemPrecisaResolucao: itemPrecisaResolucaoNcm(it, ctx),
    porque,
  }, null, 2));
  console.log("---");
}

const pdf = await fetch(`${API}/api/cotacoes/${cotId}/pdf?tipo=cliente`, { headers: auth });
console.log(`PDF HTTP: ${pdf.status}`);
