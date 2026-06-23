#!/usr/bin/env node
/**
 * Roda na VPS: cotação 72 limpa — limpa cache LLM, classifica via Gemini, reporta.
 * Uso: source /etc/cia-alpha44/api.env && node tools/vps-proof-gemini-cot72-clean.mjs [xlsx?]
 */
import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { basename } from "node:path";

const API = process.env.PROOF_API ?? "http://127.0.0.1:3333";
const COT_ID = process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const XLSX = process.argv[2] ?? process.env.COT72_XLSX ?? "";
const ALVO_FOB = 47_036;

const GABARITO = [
  { re: /massage|推脂/i, ncm: "84798999", label: "massageador" },
  { re: /lixador|HY-80036|磨脚/i, ncm: "84798999", label: "lixador" },
  { re: /pipoca|popcorn|843810/i, ncm: "84381000", label: "pipoca" },
  { re: /garrafa|bottle|961700/i, ncm: "96170010", label: "garrafa" },
  { re: /air.?fry|fritadeira|851660/i, ncm: "85166000", label: "air fryer" },
  { re: /lupa|magnif|901380/i, ncm: "90138000", label: "lupa" },
  { re: /filtro|filter|842123/i, ncm: "84212300", label: "filtro" },
];

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
  if (!r.ok) throw new Error(`parse: ${j.erro ?? r.status}`);
  return j;
}

function linhasFromDbItems(itens) {
  return itens.map((it) => {
    const meta = it.meta && typeof it.meta === "object" ? it.meta : {};
    return {
      descOriginal: it.descOriginal,
      material: meta.material ?? null,
      uso: meta.uso ?? null,
      ncm: meta.ncmPlanilhaOriginal ?? meta.ncmEmbarque ?? null,
      pesoBrutoKg: it.pesoBrutoKg != null ? Number(it.pesoBrutoKg) : null,
      pesoLiqKg: Number(it.pesoLiqKg),
      qtd: it.qtd != null ? Number(it.qtd) : null,
      fobTotalUS: meta.fobEmbarqueUS != null ? Number(meta.fobEmbarqueUS) : Number(it.fobTotalUS),
    };
  });
}

async function classificar(linhas, meta = {}) {
  const h = await authHeaders();
  const r = await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ linhas, ...meta }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`classificar: ${JSON.stringify(j).slice(0, 500)}`);
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
  if (!r.ok) throw new Error(`calcular: ${JSON.stringify(j).slice(0, 500)}`);
  return j;
}

function matchGabarito(it) {
  const txt = `${it.descOriginal} ${it.descPt} ${it.ncm}`;
  for (const g of GABARITO) if (g.re.test(txt)) return g;
  return null;
}

console.log("=== VPS PROVA GEMINI cot 72 LIMPA ===\n");

const gitSha = await import("node:child_process").then(({ execSync }) => {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: "/opt/cia-alpha44" }).toString().trim();
  } catch {
    return "?";
  }
});
console.log(`Hash deploy: ${gitSha}`);

const health = await fetch(`${API}/api/health`).then((r) => r.json()).catch(() => ({}));
console.log(`Health: ok=${health.ok} ts=${health.ts}\n`);

const prisma = new PrismaClient();
const delWhere = process.env.CLEAN_ALL_CACHE === "1" ? {} : { confirmadoHumano: false };
const del = await prisma.classificacaoCache.deleteMany({ where: delWhere });
console.log(`Cache limpo (${process.env.CLEAN_ALL_CACHE === "1" ? "LLM+humano" : "só LLM"}): ${del.count} entradas\n`);

let linhas;
let parseMeta = {};
if (XLSX && existsSync(XLSX)) {
  console.log(`Parse planilha: ${XLSX}`);
  const parsed = await parsePlanilha(XLSX);
  linhas = parsed.linhas ?? parsed;
  parseMeta = {
    moedaPlanilha: parsed.moedaPlanilha ?? null,
    cambioEurUsd: parsed.cambioEurUsd ?? null,
  };
} else {
  console.log(`Sem xlsx — linhas reconstruídas do DB (${COT_ID}), sem flags humanas`);
  const row = await prisma.cotacao.findUnique({
    where: { id: COT_ID },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  if (!row) throw new Error(`Cotação ${COT_ID} não encontrada`);
  linhas = linhasFromDbItems(row.itens);
  parseMeta = { moedaPlanilha: row.moedaPlanilha ?? "USD" };
}
await prisma.$disconnect();

console.log(`Linhas: ${linhas.length}\n`);

const cls = await classificar(linhas, parseMeta);
const cache = cls.classificacaoCache ?? {};
console.log(`Classificar: provider=${cls.provider} gemini? hits=${cache.hits} misses=${cache.misses}\n`);

const cotacao = {
  cliente: "PROVA GEMINI 72 LIMPA",
  benefFiscal: "NENHUM",
  moeda: "US$",
  moedaPlanilha: parseMeta.moedaPlanilha ?? "USD",
  cambio: 5.4372,
  freteTotalUS: 4000,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  siscomex: 153.24,
  antidumpingBRL: 0,
  incoterm: "FOB",
  origem: "CN",
  destino: "SP",
  outrasDespesasBaseBRL: 14040,
  despesas: [],
  params: {
    markupPct: 0.04,
    pisSaida: 0.0165,
    cofinsSaida: 0.076,
    icmsSaida: 0.04,
    csllSobreMarkup: 0.09,
    irrfAliq: 0.25,
    irrfBaseNotaPct: 0.027,
    ipiTetoAliqMedia: 0.15,
    ipiAliqSaida: 0,
    icmsEntrada: 0,
  },
  itens: [],
};
const calc = await calcular(cotacao, cls.itens);
const itens = calc.itens ?? cls.itens;

let gemini = 0;
let fallback = 0;
let barrados = 0;
const gabaritoRows = [];

console.log("ord\tncm\tfonte\tconf\tfobKg\tbruto\tfobUS\tdesc");
for (const it of itens) {
  const f = it.ncmFonte ?? "?";
  if (f === "gemini") gemini++;
  else if (f === "siscomex" || f === "ia") fallback++;
  const avisos = (it.avisos ?? []).join(" ");
  if (/Gemini.*inválido|sem NCM válido na TEC|fallback fluxo legado/i.test(avisos)) barrados++;
  const fobKg = it.benchmark?.fobKgMedioDI ?? it.fobKgManual ?? null;
  console.log(
    `${it.ordem ?? "?"}\t${it.ncm}\t${f}\t${it.ncmConfianca?.toFixed?.(2) ?? "—"}\t${fobKg?.toFixed?.(4) ?? "—"}\t${it.pesoBrutoKg ?? "—"}\t${(it.fobTotalUS ?? 0).toFixed(2)}\t${(it.descPt ?? it.descOriginal ?? "").slice(0, 45)}`,
  );
  const g = matchGabarito(it);
  if (g) gabaritoRows.push({ label: g.label, ncm: it.ncm, esperado: g.ncm, ok: it.ncm === g.ncm, fonte: f });
}

const fobEngine = calc.resultado?.entrada?.fobTotalUS ?? itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
const deltaPct = Math.abs(fobEngine - ALVO_FOB) / ALVO_FOB;
const gabOk = gabaritoRows.filter((r) => r.ok).length;

console.log("\n--- GABARITO ---");
for (const r of gabaritoRows) console.log(`${r.ok ? "OK" : "FAIL"}\t${r.label}\t${r.ncm}\tesperado=${r.esperado}\tfonte=${r.fonte}`);

console.log("\n--- QUATRO NÚMEROS ---");
console.log(`1) Gemini: ${gemini}/${itens.length}`);
console.log(`2) Gabarito: ${gabOk}/${gabaritoRows.length} detectados (${GABARITO.length} alvo)`);
console.log(`3) Fallback/barrados: ${fallback} siscomex/ia | ${barrados} avisos gemini→fallback`);
console.log(`4) FOB DI: US$ ${fobEngine.toFixed(2)} (alvo ${ALVO_FOB} Δ=${(deltaPct * 100).toFixed(1)}%)`);

const pass = gemini >= Math.floor(itens.length * 0.75) && gabOk >= 5 && deltaPct <= 0.07;
console.log(`\n=== ${pass ? "PASS" : "FAIL"} ===`);
process.exit(pass ? 0 : 1);
