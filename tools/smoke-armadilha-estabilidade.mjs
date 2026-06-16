#!/usr/bin/env node
/**
 * Smoke estabilidade armadilha — 3 classificações completas, caps + motos 8711.
 * Uso: CLERK_SECRET_KEY=... node tools/smoke-armadilha-estabilidade.mjs [planilha.xlsx]
 */
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";
import { ncm8Limpo } from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const XLSX =
  process.argv[2] ??
  process.env.SMOKE_ARMADILHA_XLSX ??
  "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";
const RUNS = Number(process.env.RUNS ?? "3");

if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error("CLERK_SECRET_KEY required");
  process.exit(2);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const hJson = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

async function parsePlanilha() {
  const buf = fs.readFileSync(XLSX);
  const boundary = `----stab${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="arm.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${API}/api/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`parse ${res.status}`);
  return res.json();
}

function pos4(ncm) {
  return ncm8Limpo(ncm).slice(0, 4);
}

function analisar(itens) {
  const caps = { "8711": 0, "9617": 0, "9405": 0, "72": 0 };
  const motos = [];
  const chapas = [];
  for (const it of itens) {
    const p = pos4(it.ncm);
    if (p.startsWith("8711")) caps["8711"]++;
    else if (p.startsWith("9617")) caps["9617"]++;
    else if (p.startsWith("9405")) caps["9405"]++;
    else if (p.startsWith("72")) caps["72"]++;
    if (/MOT-EL|电动摩托车|motocicleta/i.test(it.descOriginal || "")) {
      motos.push({ ncm: it.ncm, compat: it.compatibilidadeProduto, conflito: (it.ncmAvisos ?? []).some((a) => /conflitantes/i.test(a)) });
    }
    if (/CHP|chapa|钢板|Stahlblech/i.test(it.descOriginal || "")) {
      chapas.push({ ncm: it.ncm, compat: it.compatibilidadeProduto });
    }
  }
  return { caps, motos, chapas };
}

const parsed = await parsePlanilha();
const linhas = parsed.linhas ?? [];
console.log(`=== Estabilidade armadilha (${RUNS} runs, ${linhas.length} itens) ===\n`);

const snapshots = [];
for (let r = 0; r < RUNS; r++) {
  const t0 = Date.now();
  const cls = await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify({ linhas }),
  }).then((res) => res.json());
  const ms = Date.now() - t0;
  const a = analisar(cls.itens ?? []);
  snapshots.push(a);
  console.log(`run${r + 1} (${(ms / 1000).toFixed(1)}s) cache=${JSON.stringify(cls.classificacaoCache)} caps=${JSON.stringify(a.caps)}`);
  for (const m of a.motos) {
    console.log(`  moto NCM=${m.ncm} compat=${m.compat} conflito_fam=${m.conflito}`);
  }
}

const motoNcms = snapshots.map((s) => s.motos.map((m) => m.ncm).join(","));
const allMoto8711 = snapshots.every((s) => s.motos.every((m) => pos4(m.ncm).startsWith("8711")));
const noMotoConflito = snapshots.every((s) => s.motos.every((m) => !m.conflito));
const chapasOk = snapshots.every((s) =>
  s.chapas.every((c) => c.compat !== "incompativel" || pos4(c.ncm) === "0000"),
);
const capsOk = snapshots.every(
  (s) => s.caps["8711"] >= 2 && s.caps["9617"] >= 2 && s.caps["9405"] >= 2 && s.caps["72"] >= 5,
);
const estavel = new Set(motoNcms).size === 1;

console.log("\n=== RESULTADO ===");
console.log("motos_8711:", allMoto8711 ? "PASS" : "FAIL");
console.log("sem_conflito_familia_moto:", noMotoConflito ? "PASS" : "FAIL");
console.log("chapas_nunca_incompativel:", chapasOk ? "PASS" : "FAIL");
console.log("controles_caps:", capsOk ? "PASS" : "FAIL");
console.log("estavel_entre_runs:", estavel ? "PASS" : "FAIL", motoNcms);

const fail = !(allMoto8711 && noMotoConflito && chapasOk && capsOk && estavel);
process.exit(fail ? 1 : 0);
