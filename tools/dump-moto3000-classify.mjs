#!/usr/bin/env node
/** Dump classify raw output for moto 3000W item 1. */
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";

const API = "https://api2.amzofertas.com.br/cia";
const XLSX = "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));

const buf = fs.readFileSync(XLSX);
const boundary = `----d${Date.now()}`;
const body = Buffer.concat([
  Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.xlsx"\r\n\r\n`),
  buf,
  Buffer.from(`\r\n--${boundary}--\r\n`),
]);
const parsed = await fetch(`${API}/api/parse`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "content-type": `multipart/form-data; boundary=${boundary}` },
  body,
}).then((r) => r.json());

const l = parsed.linhas[0];
const cls = await fetch(`${API}/api/classificar`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
  body: JSON.stringify({ linhas: [l] }),
}).then((r) => r.json());

const it = cls.itens[0];
console.log(JSON.stringify({
  provider: cls.provider,
  classificacaoCache: cls.classificacaoCache,
  descOriginal: l.descOriginal,
  material: l.material,
  descPt: it.descPt,
  ncm: it.ncm,
  ncmFonte: it.ncmFonte,
  posicaoPasse1: it.posicaoPasse1,
  confiancaPasse1: it.confiancaPasse1,
  confiancaPasse2: it.confiancaPasse2,
  ncmCandidatos: it.ncmCandidatos,
  ncmAvisos: it.ncmAvisos,
  justificativaRGI: it.justificativaRGI,
}, null, 2));
