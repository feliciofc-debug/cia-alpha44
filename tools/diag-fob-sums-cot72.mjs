#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

const h = await authHeaders();
const det = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h }).then((r) => r.json());
const calc = await fetch(`${API}/api/calcular`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({ ...(det.cotacao ?? det), itens: det.itens }),
}).then((r) => r.json());

let se = 0, sm = 0, sb = 0, sl = 0;
for (const it of calc.itens) {
  const k = it.benchmark?.fobKgMedioDI ?? 0;
  const b = it.pesoBrutoKg ?? 0;
  const l = it.pesoLiqKg ?? 0;
  se += it.fobEmbarqueUS ?? 0;
  sm += it.fobTotalUS ?? 0;
  sb += k * b;
  sl += k * l;
}
console.log(JSON.stringify({ embarque: se, motor: sm, fobKgXbruto: sb, fobKgXliq: sl, itens: calc.itens.length }, null, 2));
