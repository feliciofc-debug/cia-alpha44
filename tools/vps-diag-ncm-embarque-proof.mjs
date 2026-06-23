#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";
import { readFileSync } from "node:fs";
import { basename } from "node:path";

const API = process.env.SMOKE_API ?? "http://127.0.0.1:3333";
const XLSX = process.argv[2] ?? "/tmp/cot72-fonte.xlsx";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
const h2 = { Authorization: `Bearer ${jwt}` };

const buf = readFileSync(XLSX);
const fd = new FormData();
fd.append("file", new Blob([buf]), basename(XLSX));
const parsed = await (await fetch(`${API}/api/parse`, { method: "POST", headers: h2, body: fd })).json();
const cls = await (
  await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ linhas: parsed.linhas, moedaPlanilha: parsed.moedaPlanilha }),
  })
).json();

console.log("=== ncmEmbarque por linha (pos-classificar) ===");
for (const [i, it] of (cls.itens ?? []).entries()) {
  const ok = !!(it.ncmEmbarque || it.ncmPlanilhaOriginal);
  console.log(
    `${i + 1}\t${ok ? "OK" : "FALTA"}\t${it.ncmFonte ?? "?"}\t${it.ncmEmbarque ?? "-"}\t${it.ncmPlanilhaOriginal ?? "-"}\t${it.descOriginal?.slice(0, 50)}`,
  );
}
