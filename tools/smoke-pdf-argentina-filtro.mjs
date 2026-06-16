#!/usr/bin/env node
/** Smoke PDF cotação Argentina filtro — só leitura. */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqgl0qip0054kwwnffs8mq9n";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
if (!u) throw new Error("Nenhum usuário Clerk");
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;

const r = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
const buf = Buffer.from(await r.arrayBuffer());
if (r.ok) {
  console.log(
    JSON.stringify({
      status: r.status,
      contentType: r.headers.get("content-type"),
      bytes: buf.length,
      isPdf: buf.slice(0, 4).toString() === "%PDF",
    }),
  );
} else {
  console.log(JSON.stringify({ status: r.status, body: buf.toString("utf8").slice(0, 500) }));
  process.exit(1);
}
