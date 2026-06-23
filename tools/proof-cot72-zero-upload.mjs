#!/usr/bin/env node
/**
 * Sprint 0 — prova upload cot 72 do ZERO (sem vps-patch).
 * parse → classificar → calcular; aceite = itens COM NCM na coluna gravam ncmEmbarque (20/20).
 */
import { createClerkClient } from "@clerk/backend";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const XLSX = process.argv[2] ?? process.env.COT72_XLSX ?? "";
const ALVO_FOB = 49_726.38;
const TOL_FOB = 1;

async function authHeaders(json = true) {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error("CLERK_SECRET_KEY ausente");
  const clerk = createClerkClient({ secretKey: key });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("Sem usuário Clerk");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return json
    ? { Authorization: `Bearer ${jwt}`, "content-type": "application/json" }
    : { Authorization: `Bearer ${jwt}` };
}

async function parsePlanilha(path) {
  const buf = readFileSync(path);
  const h = await authHeaders(false);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), basename(path));
  const r = await fetch(`${API}/api/parse`, { method: "POST", headers: h, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(`parse: ${JSON.stringify(j).slice(0, 300)}`);
  return j;
}

async function classificar(linhas, meta = {}) {
  const h = await authHeaders();
  const r = await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ linhas, ...meta }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`classificar: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

async function calcular(cotacao) {
  const h = await authHeaders();
  const r = await fetch(`${API}/api/calcular`, {
    method: "POST",
    headers: h,
    body: JSON.stringify(cotacao),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`calcular: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

if (!XLSX || !existsSync(XLSX)) {
  console.error("Uso: CLERK_SECRET_KEY=... node tools/proof-cot72-zero-upload.mjs <planilha-72.xlsx>");
  process.exit(2);
}

console.log("=== PROVA cot 72 ZERO UPLOAD (sem patch) ===\n");
console.log(`API: ${API}`);
console.log(`Planilha: ${XLSX}\n`);

const parsed = await parsePlanilha(XLSX);
const linhas = parsed.linhas ?? parsed;
const metaParse = parsed.metaNcmEmbarque;
console.log(`Parse: ${linhas.length} linhas`);
if (metaParse) {
  console.log(
    `  coluna NCM: ${metaParse.colunaDetectada ? "detectada" : "AUSENTE"} — ${metaParse.linhasComNcmColuna}/${metaParse.totalLinhas} linhas com NCM na coluna`,
  );
}
const avisoNcm = (parsed.avisos ?? []).find((a) => /NCM embarque:/i.test(a));
if (avisoNcm) console.log(`  ${avisoNcm}`);

const cls = await classificar(linhas, {
  moedaPlanilha: parsed.moedaPlanilha ?? null,
  cambioEurUsd: parsed.cambioEurUsd ?? null,
});
const itensCls = cls.itens ?? [];

const fontes = {};
let planilhaCliente = 0;
let planilhaChina = 0;
for (const it of itensCls) {
  const f = it.ncmFonte ?? "?";
  fontes[f] = (fontes[f] ?? 0) + 1;
  if (f === "planilha-cliente" || f === "planilha-cliente-familia") planilhaCliente++;
  if (f === "planilha-china") planilhaChina++;
}

console.log("\n--- NCM fonte (pos-classificar) ---");
for (const [f, n] of Object.entries(fontes).sort()) console.log(`  ${f}: ${n}`);
console.log(`  planilha-cliente* total: ${planilhaCliente}/${itensCls.length}`);
if (planilhaChina) console.log(`  ERRO planilha-china: ${planilhaChina}`);

const cotacao = {
  cliente: "PROVA ZERO UPLOAD 72",
  benefFiscal: "NENHUM",
  moeda: "USD",
  moedaPlanilha: parsed.moedaPlanilha ?? "USD",
  cambio: 5.4372,
  freteTotalUS: 1060,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  siscomex: 153.24,
  antidumpingBRL: 0,
  incoterm: "FOB",
  origem: "CN",
  destino: "SP",
  outrasDespesasBaseBRL: 14040,
  params: { markupPct: 0.04, ipiAliqSaida: 0 },
  despesas: [],
  itens: itensCls,
};
const calc = await calcular(cotacao);
const itens = calc.itens ?? itensCls;
const fobEngine = calc.resultado?.entrada?.fobTotalUS ?? 0;
const fobSum = itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);

console.log("\n--- FOB ---");
console.log(`  motor entrada: US$ ${fobEngine.toFixed(2)}`);
console.log(`  soma itens:    US$ ${fobSum.toFixed(2)}`);
console.log(`  alvo:          US$ ${ALVO_FOB.toFixed(2)}`);

const alvoEmbarque =
  metaParse?.linhasComNcmColuna ??
  itens.filter((it) => it.ncmEmbarqueStatus === "coluna").length;
const okEmbarque = itens.filter(
  (it) => it.ncmEmbarqueStatus === "coluna" && it.ncmEmbarque,
).length;
const semColuna = itens.filter((it) => it.ncmEmbarqueStatus === "sem-ncm-coluna");
const geminiSemColuna = semColuna.filter((it) => it.ncmFonte === "gemini" || it.ncmFonte === "ia");

console.log(`\n--- ncmEmbarque (aceite: coluna ${okEmbarque}/${alvoEmbarque}) ---`);
console.log(`  herança família: ${itens.filter((it) => it.ncmEmbarqueStatus === "heranca-familia").length}`);
console.log(`  sem-ncm-coluna:  ${semColuna.length} (gemini/IA: ${geminiSemColuna.length} — esperado, não bloqueia)`);
if (semColuna.length) {
  for (const it of semColuna) {
    console.log(
      `    · ordem ${it.ordem ?? "?"} ${it.ncmFonte ?? "?"} — ${it.descOriginal?.slice(0, 50)}`,
    );
  }
}

const passFob = Math.abs(fobEngine - ALVO_FOB) <= TOL_FOB;
const passCliente = planilhaCliente >= 20;
const passEmbarque = alvoEmbarque > 0 && okEmbarque === alvoEmbarque;
const pass = passFob && passCliente && planilhaChina === 0 && passEmbarque;

console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
console.log(
  `  FOB ${passFob ? "OK" : "FAIL"} | planilha-cliente>=20 ${passCliente ? "OK" : "FAIL"} | sem planilha-china ${planilhaChina === 0 ? "OK" : "FAIL"} | ncmEmbarque coluna ${okEmbarque}/${alvoEmbarque} ${passEmbarque ? "OK" : "FAIL"}`,
);
process.exit(pass ? 0 : 1);
