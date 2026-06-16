#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";
import { itensBloqueandoPdf } from "@cia/shared";
import { exigirCotacaoExplicita } from "./smoke-guard.mjs";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = exigirCotacaoExplicita(process.env.SMOKE_COT, "smoke-armadilha-pdf-caps");

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const h = { Authorization: `Bearer ${jwt}` };

const d = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());
const bloq = itensBloqueandoPdf(d.itens);
console.log("bloqueando_pdf", bloq.length);

const pdf = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, { headers: h });
const pdfTxt = pdf.status !== 200 ? await pdf.text() : "";
console.log("pdf_status", pdf.status, "ctype", pdf.headers.get("content-type"));
if (pdfTxt) console.log("pdf_erro", pdfTxt.slice(0, 300));

const caps = { "8711": 0, "9617": 0, "9405": 0, "72": 0, other: 0 };
for (const it of d.itens) {
  const p = (it.ncm || "").replace(/\D/g, "").slice(0, 4);
  if (p.startsWith("8711")) caps["8711"]++;
  else if (p.startsWith("9617")) caps["9617"]++;
  else if (p.startsWith("9405")) caps["9405"]++;
  else if (p.startsWith("72")) caps["72"]++;
  else caps.other++;
}
console.log("caps", caps);
const it14 = d.itens[13];
console.log("item14", it14?.ncm, it14?.compatibilidadeProduto, "confirmado", it14?.ncmRevisadoHumano);

const ok = bloq.length === 0 && pdf.status === 200 && caps["72"] >= 5 && caps["8711"] >= 2 && caps["9617"] >= 2 && caps["9405"] >= 2;
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
