#!/usr/bin/env node
/** Lista cotação com erva-mate (read-only). */
import { createClerkClient } from "@clerk/backend";
const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = await clerk.users.getUserList({ limit: 1 });
let s = (await clerk.sessions.getSessionList({ userId: u.data[0].id, status: "active", limit: 1 })).data[0]?.id;
if (!s) s = (await clerk.sessions.createSession({ userId: u.data[0].id })).id;
const tok = await clerk.sessions.getToken(s, undefined, 3600);
const jwt = typeof tok === "string" ? tok : tok.jwt;
const h = { Authorization: `Bearer ${jwt}` };
const list = await fetch(`${API}/api/cotacoes?limit=50`, { headers: h }).then((r) => r.json());
const rows = list.cotacoes ?? list;
for (const c of rows) {
  const det = await fetch(`${API}/api/cotacoes/${c.id}`, { headers: h }).then((r) => r.json());
  const m = (det.itens ?? []).find((it) =>
    /erva.?mate|\bmate\b/i.test(`${it.descPt ?? ""} ${it.descOriginal ?? ""}`),
  );
  if (m) {
    console.log(JSON.stringify({ id: c.id, ordem: m.ordem, ncm: (m.ncm ?? "").replace(/\D/g, ""), cliente: c.cliente }));
    process.exit(0);
  }
}
console.log("NONE");
process.exit(1);
