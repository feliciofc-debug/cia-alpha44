#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";
const API = "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0].id;
let s = (await clerk.sessions.getSessionList({ userId: u, status: "active", limit: 1 })).data[0]?.id;
if (!s) s = (await clerk.sessions.createSession({ userId: u })).id;
const jwt = (await clerk.sessions.getToken(s, undefined, 3600)).jwt;
const h = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

const det = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());
console.log("itens:", det.itens?.length, "total:", det.financeiro?.totalBRL ?? det.totalBRL);
for (const it of det.itens ?? []) {
  const ncm = (it.ncm ?? "").replace(/\D/g, "");
  const lk = await fetch(`${API}/api/ncm/lookup`, {
    method: "POST",
    headers: h,
    body: JSON.stringify({ ncm }),
  }).then((r) => r.json());
  console.log(
    JSON.stringify({
      ordem: it.ordem,
      ncm,
      iiItem: it.aliquotas?.ii,
      ipiItem: it.aliquotas?.ipi,
      iiLookup: lk?.aliquotas?.ii ?? lk?.ii,
      ipiLookup: lk?.aliquotas?.ipi ?? lk?.ipi,
      fob: it.fobEmbarqueUS ?? it.fobTotalUS,
      desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 40),
    }),
  );
}
