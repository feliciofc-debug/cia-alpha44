#!/usr/bin/env node
/** Compare classify item1 alone vs batch 17 — cache + NCM. */
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";

const API = "https://api2.amzofertas.com.br/cia";
const XLSX = "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

const buf = fs.readFileSync(XLSX);
const b = `----b${Date.now()}`;
const body = Buffer.concat([
  Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="a.xlsx"\r\n\r\n`),
  buf,
  Buffer.from(`\r\n--${b}--\r\n`),
]);
const parsed = await fetch(`${API}/api/parse`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "content-type": `multipart/form-data; boundary=${b}` },
  body,
}).then((r) => r.json());
const linhas = parsed.linhas;

async function classificar(linhasIn, label) {
  const cls = await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ linhas: linhasIn }),
  }).then((r) => r.json());
  const it = cls.itens[0];
  console.log(`\n[${label}] cache:`, cls.classificacaoCache);
  console.log(`  item1 NCM=${it?.ncm} fonte=${it?.ncmFonte} posP1=${it?.posicaoPasse1 ?? "-"}`);
  console.log(`  candidatos:`, it?.ncmCandidatos?.map((c) => c.ncm).join(", "));
  console.log(`  avisos:`, (it?.ncmAvisos ?? []).slice(0, 3).join(" | "));
  return cls;
}

await classificar(linhas, "batch-17");
await classificar([linhas[0]], "solo-item1");
const l2 = { ...linhas[0], material: "钢" };
await classificar([l2], "solo-material-so-aco");
