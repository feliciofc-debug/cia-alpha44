#!/usr/bin/env node
import { createClerkClient } from "@clerk/backend";
const API = "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0].id;
let s = (await clerk.sessions.getSessionList({ userId: u, status: "active", limit: 1 })).data[0]?.id;
if (!s) s = (await clerk.sessions.createSession({ userId: u })).id;
const jwt = (await clerk.sessions.getToken(s, undefined, 3600)).jwt;
const h = { Authorization: `Bearer ${jwt}` };
const det = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());
const it = det.itens?.[0];
console.log(JSON.stringify({
  totalBRL: det.financeiro?.totalBRL ?? det.totalBRL,
  ncm: it?.ncm,
  ii: it?.aliquotas?.ii,
  ipi: it?.aliquotas?.ipi,
  peso: it?.pesoLiqKg,
  fobTotal: it?.fobTotalUS,
  fobEmbarque: it?.fobEmbarqueUS,
  fobKgFonte: it?.fobKgFonte,
  calibracao: it?.calibracao,
  benchmark: it?.benchmark,
  ncmRevisadoHumano: it?.ncmRevisadoHumano,
  ncmClassificacaoCache: it?.ncmClassificacaoCache,
  descOriginal: it?.descOriginal?.slice(0, 80),
}, null, 2));
