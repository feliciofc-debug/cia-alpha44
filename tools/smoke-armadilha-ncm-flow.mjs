#!/usr/bin/env node
/**
 * Smoke fluxo NCM armadilha — passos 2-5 + regressão (API prod).
 * VPS: set -a && source /etc/cia-alpha44/api.env && set +a && node tools/smoke-armadilha-ncm-flow.mjs
 */
import { createClerkClient } from "@clerk/backend";
import {
  itemBloqueiaPdfNcm,
  itemPodeConfirmarNcm,
  itemPodeConfirmarNcmIndividual,
  itensBloqueandoPdf,
  ncm8Limpo,
} from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.env.SMOKE_COT ?? "cmqfu34co000ukwgg6d0e8pcd";
const ORDEM_CHAPA = 13;

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const users = await clerk.users.getUserList({ limit: 1 });
const uid = users.data[0]?.id;
const sessions = await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 });
let sid = sessions.data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;
const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

async function getCotacao() {
  const res = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h });
  if (!res.ok) throw new Error(`GET ${res.status}`);
  return res.json();
}

function pos4(ncm) {
  return ncm8Limpo(ncm).slice(0, 4);
}

const checks = [];

console.log(`=== Armadilha ${COT} ===\n`);

let det = await getCotacao();
const chapaAntes = det.itens[ORDEM_CHAPA];
console.log(
  `[0] Item 14 (ordem ${ORDEM_CHAPA}): NCM ${chapaAntes?.ncm} compat=${chapaAntes?.compatibilidadeProduto}`,
);

console.log("\n[2] PATCH NCM 72104900 → re-avalia compatibilidade");
const t0 = Date.now();
const patch = await fetch(`${API}/api/cotacoes/${COT}/itens/${ORDEM_CHAPA}/ncm`, {
  method: "PATCH",
  headers: h,
  body: JSON.stringify({ ncm: "72104900" }),
});
const patchBody = await patch.json();
const ms = Date.now() - t0;
const chapaPosPatch = patchBody.itens?.[ORDEM_CHAPA];
const saiuIncompativel = chapaPosPatch?.compatibilidadeProduto !== "incompativel";
console.log(
  `  HTTP ${patch.status} ${ms}ms · compat=${chapaPosPatch?.compatibilidadeProduto} · saiu_incompativel=${saiuIncompativel}`,
);
checks.push(["patch_reavalia", patch.ok && saiuIncompativel]);

det = patch.ok ? patchBody : await getCotacao();
let chapa = det.itens[ORDEM_CHAPA];

if (itemBloqueiaPdfNcm(chapa)) {
  console.log("\n[3] POST confirmar NCM individual (override se necessário)");
  const pode = itemPodeConfirmarNcmIndividual(chapa);
  console.log(`  itemPodeConfirmarNcmIndividual=${pode}`);
  if (pode) {
    const conf = await fetch(`${API}/api/cotacoes/${COT}/itens/${ORDEM_CHAPA}/confirmar-ncm`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({ confirmadoPor: "smoke-armadilha-flow" }),
    });
    const confBody = await conf.json();
    chapa = confBody.itens?.[ORDEM_CHAPA] ?? chapa;
    const destravou = !itemBloqueiaPdfNcm(chapa);
    console.log(`  HTTP ${conf.status} · confirmado=${chapa?.ncmRevisadoHumano} · pdf_ok=${destravou}`);
    checks.push(["override_destrava", conf.ok && destravou]);
    det = conf.ok ? confBody : det;
  } else {
    checks.push(["override_destrava", false]);
  }
} else {
  console.log("\n[3] SKIP override — item já não bloqueia PDF após PATCH");
  checks.push(["override_destrava", true]);
}

console.log("\n[4] POST confirmar-ncm-lote (bug 2 — dispara e atualiza)");
const incAntes = det.itens.filter((it) => it.compatibilidadeProduto === "incompativel" && !it.ncmRevisadoHumano);
const elegLote = det.itens.filter((it) => itemPodeConfirmarNcm(it));
console.log(`  elegíveis_lote=${elegLote.length} · incompatíveis_não_confirmados=${incAntes.length}`);
const lote = await fetch(`${API}/api/cotacoes/${COT}/itens/confirmar-ncm-lote`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ confirmadoPor: "smoke-armadilha-lote" }),
});
const loteBody = await lote.json();
console.log(
  `  HTTP ${lote.status} · aprovados=${loteBody.aprovados} pulados=${loteBody.pulados} pendentes=${loteBody.pendentes}`,
);
const incAprovadosNoLote =
  lote.ok &&
  incAntes.some((itAntes) => {
    const dep = loteBody.itens?.find((it, i) => det.itens[i]?.descOriginal === itAntes.descOriginal);
    return dep?.ncmRevisadoHumano && itAntes.compatibilidadeProduto === "incompativel";
  });
checks.push(["lote_dispara", lote.ok]);
checks.push(["lote_nao_aprova_incompativel", lote.ok && !incAprovadosNoLote]);
det = lote.ok ? loteBody : await getCotacao();

console.log("\n[5] PDF bloqueado?");
const bloqueados = itensBloqueandoPdf(det.itens);
const pdfFecha = bloqueados.length === 0;
console.log(`  itens_bloqueando=${bloqueados.length} · pdf_fecha=${pdfFecha}`);
checks.push(["pdf_fecha", pdfFecha]);

console.log("\n=== REGRESSÃO — 17 itens ===");
const expect = [
  { idx: 0, pos: "8711", label: "moto" },
  { idx: 1, pos: "8711", label: "moto" },
  { idx: 2, pos: "9617", label: "garrafa" },
  { idx: 3, pos: "9405", label: "lustre" },
  { idx: 4, pos: "72", label: "chapa cap72", ordem: ORDEM_CHAPA },
];
let regOk = true;
for (const it of det.itens) {
  const p = pos4(it.ncm);
  const flags = [it.compatibilidadeProduto, it.ncmRevisadoHumano ? "OK" : null].filter(Boolean).join("|");
  if (it.ordem === ORDEM_CHAPA || p.startsWith("8711") || p.startsWith("9617") || p.startsWith("9405") || p.startsWith("72")) {
    console.log(`  #${it.ordem + 1} ${(it.descPt || "").slice(0, 30)} NCM=${it.ncm} pos=${p} ${flags}`);
  }
}
for (const e of expect) {
  const it = det.itens[e.idx];
  if (!it) continue;
  const p = pos4(it.ncm);
  if (!p.startsWith(e.pos)) {
    regOk = false;
    console.log(`  FAIL ${e.label}: esperava cap ${e.pos}, got ${p}`);
  }
}
const chapaFinal = det.itens[ORDEM_CHAPA];
if (!pos4(chapaFinal?.ncm).startsWith("72")) regOk = false;
checks.push(["regressao_caps", regOk]);

const compativelOk = det.itens.some(
  (it) => it.compatibilidadeProduto === "compativel" && it.ncmRevisadoHumano,
);
checks.push(["confirm_individual_compativel", compativelOk || det.itens.every((it) => !itemBloqueiaPdfNcm(it))]);

console.log("\n=== RESULTADO ===");
let fail = 0;
for (const [k, v] of checks) {
  console.log(`  ${k}: ${v ? "PASS" : "FAIL"}`);
  if (!v) fail++;
}
process.exit(fail ? 1 : 0);
