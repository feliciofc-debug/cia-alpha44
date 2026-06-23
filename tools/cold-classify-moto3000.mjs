#!/usr/bin/env node
/** Apaga cache classificacao MOT-EL-3000 e re-classifica frio. */
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";
import { chaveClassificacaoCache, catalogVersionKey, criarNcmCatalog, loadNcmVigente, CLASSIFICACAO_PROMPT_VERSION } from "@cia/pipeline";
import { PrismaClient } from "@prisma/client";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const XLSX = "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";

const catalog = criarNcmCatalog(loadNcmVigente());
const versoes = {
  promptVersion: process.env.CLASSIFICACAO_PROMPT_VERSION ?? "PROMPT_PASSE2_V5_TR_V1",
  catalogVersion: catalogVersionKey(catalog),
};

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));

const buf = fs.readFileSync(XLSX);
const b = `----c${Date.now()}`;
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
const l = parsed.linhas[0];

const input = { descOriginal: l.descOriginal, material: l.material, uso: l.uso };
const chave = chaveClassificacaoCache(input, versoes.promptVersion, versoes.catalogVersion);
console.log("chave", chave.slice(0, 16) + "...");

if (process.env.DATABASE_URL) {
  const prisma = new PrismaClient();
  const del = await prisma.classificacaoCache.deleteMany({ where: { chave } });
  console.log("cache deleted:", del.count);
  await prisma.$disconnect();
} else {
  console.log("DATABASE_URL ausente — skip delete local");
}

const cls = await fetch(`${API}/api/classificar`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "content-type": "application/json" },
  body: JSON.stringify({ linhas: [l] }),
}).then((r) => r.json());
const it = cls.itens[0];
console.log("cache stats:", cls.classificacaoCache);
console.log("NCM:", it.ncm, "candidatos:", it.ncmCandidatos?.map((c) => c.ncm).join(", "));
console.log("posP1:", it.posicaoPasse1, "avisos:", (it.ncmAvisos ?? []).slice(0, 2));
