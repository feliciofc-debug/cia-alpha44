#!/usr/bin/env node
/** Smoke pós-deploy — juiz único PDF (sim-china + canários + bloqueio legítimo). */
import { createClerkClient } from "@clerk/backend";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itemPodeConfirmarNcmIndividual,
  itensResolucaoNcm,
} from "@cia/shared";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_SIM_CHINA = process.argv[2] ?? "cmqgy89om000ykwaz7cd24o0a";
const COT_AZEITE = process.argv[3] ?? "cmqgrmhbt000vkwarr0ve3c4e";
const COT_FILTRO = process.argv[4] ?? "cmqgl0qip0054kwwnffs8mq9n";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const { criarPdfNcmAuditCtx, criarNcmCatalog, loadNcmVigente } = await import(
  pathToFileURL(join(root, "packages/pipeline/dist/index.js")).href,
);
const ctx = criarPdfNcmAuditCtx(criarNcmCatalog(loadNcmVigente()));

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
if (!u) throw new Error("Nenhum usuário Clerk");
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;
const auth = { Authorization: `Bearer ${jwt}` };

async function getCotacao(id) {
  const r = await fetch(`${API}/api/cotacoes/${id}`, { headers: auth });
  if (!r.ok) throw new Error(`GET ${id}: ${r.status}`);
  return r.json();
}

async function pdfStatus(id) {
  const r = await fetch(`${API}/api/cotacoes/${id}/pdf?tipo=cliente`, { headers: auth });
  const buf = r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  return { status: r.status, isPdf: buf?.slice(0, 4).toString() === "%PDF", bytes: buf?.length ?? 0 };
}

const checks = [];

// 1) sim-china — PDF 200, carrinho/trena compatível não bloqueiam
const china = await getCotacao(COT_SIM_CHINA);
const alvos = (china.itens ?? []).filter((i) => /carrinho|trena/i.test(i.descPt || i.descOriginal || ""));
const pdfChina = await pdfStatus(COT_SIM_CHINA);
const carrinhoTrenaOk = alvos.every(
  (it) =>
    it.compatibilidadeProduto === "compativel" &&
    !itemBloqueiaPdfNcm(it, ctx) &&
    !itemPrecisaResolucaoNcm(it, ctx),
);
checks.push(["sim_china_pdf_200", pdfChina.status === 200 && pdfChina.isPdf]);
checks.push(["carrinho_trena_nao_bloqueiam", carrinhoTrenaOk && alvos.length === 2]);
console.log("1) sim-china", { pdf: pdfChina.status, carrinhoTrenaOk, alvos: alvos.length });

// 2) canários azeite + filtro
for (const [nome, id] of [
  ["azeite", COT_AZEITE],
  ["filtro", COT_FILTRO],
]) {
  const p = await pdfStatus(id);
  checks.push([`${nome}_pdf_200`, p.status === 200 && p.isPdf]);
  console.log(`2) ${nome}`, p);
}

// 3) bloqueio legítimo — revisar ou incompatível bloqueia + barra + editar/confirmar
let bloqueioLegitimo = false;
for (const id of [COT_SIM_CHINA, COT_AZEITE, COT_FILTRO, "cmqgl0qip0054kwwnffs8mq9n"]) {
  const cot = await getCotacao(id);
  const candidatos = (cot.itens ?? []).filter(
    (it) => it.compatibilidadeProduto === "revisar" || it.compatibilidadeProduto === "incompativel",
  );
  for (const it of candidatos) {
    const audit = auditarItemNcmParaPdf(it, ctx);
    const naBarra = itensResolucaoNcm(cot.itens, ctx).some((x) => x.item.ordem === it.ordem);
    const podeConfirmar = itemPodeConfirmarNcmIndividual(it, ctx);
    if (audit.bloqueia && itemPrecisaResolucaoNcm(it, ctx) && naBarra && podeConfirmar) {
      bloqueioLegitimo = true;
      console.log("3) bloqueio legítimo", {
        cotacao: id,
        ordem: it.ordem,
        compat: it.compatibilidadeProduto,
        motivo: audit.motivo?.slice(0, 60),
      });
      break;
    }
  }
  if (bloqueioLegitimo) break;
}
if (!bloqueioLegitimo) {
  console.log("3) bloqueio legítimo — nenhum revisar/incompatível nas cotações testadas; OK se gate revisar bloqueia");
  const revisar = {
    descOriginal: "X",
    descPt: "X",
    descDuimp: "X",
    ncm: "87149490",
    compatibilidadeProduto: "revisar",
    pesoLiqKg: 1,
    fobTotalUS: 1,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icms: 0 },
  };
  const audit = auditarItemNcmParaPdf(revisar, ctx);
  bloqueioLegitimo =
    audit.bloqueia && itemPrecisaResolucaoNcm(revisar, ctx) && itemPodeConfirmarNcmIndividual(revisar, ctx);
}
checks.push(["bloqueio_legitimo_revisar", bloqueioLegitimo]);

console.log("\n=== RESULTADO ===");
let fail = 0;
for (const [nome, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${nome}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
