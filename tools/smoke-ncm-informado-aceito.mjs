#!/usr/bin/env node
/** Smoke — NCM informado aceito (whisky/chá + canários). */
import { createClerkClient } from "@clerk/backend";
import { itemBloqueiaPdfNcm, itemPrecisaResolucaoNcm } from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
const auth = { Authorization: `Bearer ${jwt}` };

async function pdf(id) {
  const r = await fetch(`${API}/api/cotacoes/${id}/pdf?tipo=cliente`, { headers: auth });
  return r.status;
}

async function get(id) {
  return (await fetch(`${API}/api/cotacoes/${id}`, { headers: auth })).json();
}

const checks = [];

// Sintético whisky/chá
for (const [nome, ncm] of [["whisky", "22083020"], ["cha", "09023000"]]) {
  const it = { ncm, ncmValido: false, compatibilidadeProduto: "revisar" };
  checks.push([nome, !itemBloqueiaPdfNcm(it) && !itemPrecisaResolucaoNcm(it)]);
}

for (const [nome, id] of [
  ["sim_china", "cmqgy89om000ykwaz7cd24o0a"],
  ["azeite", "cmqgrmhbt000vkwarr0ve3c4e"],
  ["filtro", "cmqgl0qip0054kwwnffs8mq9n"],
]) {
  checks.push([`${nome}_pdf`, (await pdf(id)) === 200]);
}

// UK search
const list = await (await fetch(`${API}/api/cotacoes?limite=80`, { headers: auth })).json();
for (const c of list.cotacoes ?? []) {
  const det = await get(c.id);
  const whisky = (det.itens ?? []).find((i) => /whisky|22083020/i.test(JSON.stringify(i)));
  if (whisky) {
    checks.push(["uk_whisky_nao_bloqueia", !itemBloqueiaPdfNcm(whisky)]);
    checks.push(["uk_pdf", (await pdf(c.id)) === 200]);
    console.log("UK cotacao:", c.id);
    break;
  }
}

console.log("=== RESULTADO ===");
let fail = 0;
for (const [n, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${n}`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
