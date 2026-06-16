#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";
import { exigirCotacaoExplicita } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = exigirCotacaoExplicita(process.env.SMOKE_COT, "smoke-pdf-erro-body");

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const h = { Authorization: `Bearer ${jwt}` };
const r = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, { headers: h });
console.log("status", r.status);
console.log(await r.text());
