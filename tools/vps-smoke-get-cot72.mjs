#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
const r = await fetch(`${API}/api/cotacoes/${COT}`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
const j = await r.json();
console.log(`GET cot72 status ${r.status} itens ${j.itens?.length ?? 0}`);
console.log("ordem\tncm\tncmFonte\tncmEmbarque\tncmPlanilhaOriginal");
for (const it of j.itens ?? []) {
  console.log(
    [it.ordem, it.ncm, it.ncmFonte, it.ncmEmbarque ?? "-", it.ncmPlanilhaOriginal ?? "-"].join("\t"),
  );
}
