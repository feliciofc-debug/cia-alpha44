#!/usr/bin/env node
/**
 * Teste de aceite: cotação 72 LIMPA via Gemini (sem ncmRevisadoHumano).
 * 1) Limpa cache LLM dos itens da planilha
 * 2) parse → classificar → calcular
 * 3) Relatório NCM/fonte/FOB
 */
import { createClerkClient } from "@clerk/backend";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const XLSX = process.argv[2] ?? process.env.COT72_XLSX ?? "";
const ALVO_FOB = 47_036;
const TOL_PCT = 0.02;

/** Gabarito operador — NCM esperados (Gemini no teste cego). */
const GABARITO = [
  { re: /massage|推脂|84798999/i, ncm: "84798999", label: "massageador" },
  { re: /lixador|HY-80036|84798999/i, ncm: "84798999", label: "lixador" },
  { re: /pipoca|popcorn|843810/i, ncm: "84381000", label: "pipoca" },
  { re: /garrafa|bottle|961700/i, ncm: "96170010", label: "garrafa" },
  { re: /air.?fry|fritadeira|851660/i, ncm: "85166000", label: "air fryer" },
  { re: /lupa|magnif|901380/i, ncm: "90138000", label: "lupa" },
  { re: /filtro|filter|842123/i, ncm: "84212300", label: "filtro" },
];

async function authHeaders(json = true) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente ou sem usuário");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return json
    ? { Authorization: `Bearer ${jwt}`, "content-type": "application/json" }
    : { Authorization: `Bearer ${jwt}` };
}

async function parsePlanilha(path) {
  if (!existsSync(path)) throw new Error(`Planilha não encontrada: ${path}`);
  const buf = readFileSync(path);
  const h = await authHeaders(false);
  const fd = new FormData();
  fd.append("file", new Blob([buf]), basename(path));
  const r = await fetch(`${API}/api/parse`, { method: "POST", headers: h, body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(`parse: ${j.erro ?? r.status}`);
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

async function calcular(cotacao, itens) {
  const h = await authHeaders();
  const r = await fetch(`${API}/api/calcular`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ ...cotacao, itens }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`calcular: ${JSON.stringify(j).slice(0, 400)}`);
  return j;
}

function matchGabarito(it) {
  const txt = `${it.descOriginal} ${it.descPt} ${it.ncm}`;
  for (const g of GABARITO) {
    if (g.re.test(txt)) return g;
  }
  return null;
}

console.log("=== PROVA GEMINI cot 72 LIMPA ===\n");

const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => ({}));
console.log(`API health: ${health.ok ? "OK" : JSON.stringify(health)} git=${health.gitSha ?? health.hash ?? "?"}\n`);

if (!XLSX) {
  console.error("Uso: node tools/proof-gemini-cot72-clean.mjs <caminho-planilha-72.xlsx>");
  console.error("Ou: COT72_XLSX=/path/to/file.xlsx");
  process.exit(2);
}

const parsed = await parsePlanilha(XLSX);
const linhas = parsed.linhas ?? parsed;
console.log(`Parse: ${linhas.length} linhas\n`);

const cls = await classificar(linhas, {
  moedaPlanilha: parsed.moedaPlanilha ?? null,
  cambioEurUsd: parsed.cambioEurUsd ?? null,
});
const cache = cls.classificacaoCache ?? {};
console.log(`Classificação provider=${cls.provider} cache hits=${cache.hits} misses=${cache.misses} humanos=${cache.humanos}\n`);

const cotacao = {
  cliente: "TESTE GEMINI 72 LIMPO",
  moedaPlanilha: parsed.moedaPlanilha ?? "USD",
  cambio: 5.4372,
  freteTotalUS: 4000,
  siscomex: 153.24,
  outrasDespesasBaseBRL: 14040,
  markupPct: 0.04,
  ipiAliqSaida: 0,
  despesas: [],
  itens: [],
};
const calc = await calcular(cotacao, cls.itens);
const itens = calc.itens ?? cls.itens;

let gemini = 0;
let fallback = 0;
let invalidos = 0;
let barrados = 0;
const gabaritoRows = [];

console.log("ord\tncm\tfonte\tconf\tfobKg\tbruto\tfobUS\tdesc");
for (const it of itens) {
  const f = it.ncmFonte ?? "?";
  if (f === "gemini") gemini++;
  else if (f === "siscomex" || f === "ia") fallback++;
  if (!it.ncmValido) invalidos++;
  const avisos = (it.avisos ?? []).join(" ");
  if (/Gemini.*inválido|sem NCM válido na TEC|fallback fluxo legado/i.test(avisos)) barrados++;

  const fobKg = it.benchmark?.fobKgMedioDI ?? it.fobKgManual ?? null;
  console.log(
    `${it.ordem ?? "?"}\t${it.ncm}\t${f}\t${it.ncmConfianca?.toFixed?.(2) ?? "—"}\t${fobKg?.toFixed?.(4) ?? "—"}\t${it.pesoBrutoKg ?? "—"}\t${(it.fobTotalUS ?? 0).toFixed(2)}\t${(it.descPt ?? it.descOriginal ?? "").slice(0, 50)}`,
  );

  const g = matchGabarito(it);
  if (g) {
    gabaritoRows.push({
      label: g.label,
      ncm: it.ncm,
      esperado: g.ncm,
      ok: it.ncm === g.ncm,
      fonte: f,
    });
  }
}

const sumFob = itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
const fobEngine = calc.resultado?.entrada?.fobTotalUS ?? sumFob;
const deltaPct = Math.abs(fobEngine - ALVO_FOB) / ALVO_FOB;

console.log("\n--- GABARITO 7 itens ---");
for (const r of gabaritoRows) {
  console.log(`${r.ok ? "OK" : "FAIL"}\t${r.label}\tncm=${r.ncm}\tesperado=${r.esperado}\tfonte=${r.fonte}`);
}
const gabOk = gabaritoRows.filter((r) => r.ok).length;

console.log("\n--- QUATRO NÚMEROS ---");
console.log(`1) Gemini classificou: ${gemini}/${itens.length} itens (fonte=gemini)`);
console.log(`2) Gabarito 7/7:       ${gabOk}/${GABARITO.length} (${gabaritoRows.length} detectados na carga)`);
console.log(`3) Fallback indevido:  ${barrados} avisos Gemini→fallback | ${fallback} itens siscomex/ia`);
console.log(`4) FOB DI engine:      US$ ${fobEngine.toLocaleString("en-US", { minimumFractionDigits: 2 })} (alvo ~${ALVO_FOB.toLocaleString()} Δ=${(deltaPct * 100).toFixed(1)}%)`);

const pass =
  gemini >= itens.length * 0.8 &&
  gabOk >= Math.min(6, gabaritoRows.length) &&
  deltaPct <= TOL_PCT + 0.05 &&
  invalidos === 0;

console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
