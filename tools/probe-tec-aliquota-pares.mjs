#!/usr/bin/env node
/** Probe TEC local na VPS — achar par NCM com alíquotas diferentes entre itens da cot 72. */
import { createClerkClient } from "@clerk/backend";
import { loadNcmVigenteCache, criarNcmCatalog } from "@cia/pipeline";
import { createTecSource } from "../apps/api/dist/services/tec.js";

const API = "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0].id;
let s = (await clerk.sessions.getSessionList({ userId: u, status: "active", limit: 1 })).data[0]?.id;
if (!s) s = (await clerk.sessions.createSession({ userId: u })).id;
const jwt = (await clerk.sessions.getToken(s, undefined, 3600)).jwt;
const h = { Authorization: `Bearer ${jwt}` };

const tec = createTecSource();
async function aliqNcm(ncm) {
  const t = await (tec.buscarAsync?.(ncm) ?? Promise.resolve(tec.buscar(ncm)));
  return t?.aliquotas ?? null;
}

const det = await fetch(`${API}/api/cotacoes/${COT}`, { headers: h }).then((r) => r.json());

/** NCMs alternativos plausíveis (erro IA típico — mesma família, subitem diferente). */
const ALTERNATIVAS = {
  "84732910": ["84798999", "84733011", "85098010"],
  "42029200": ["42022210", "42021210", "39269090"],
  "84512100": ["84501100", "84502000", "85163200"],
  "85163200": ["85163100", "85165000", "96151100"],
  "84798999": ["84732910", "85437099", "90328929"],
  "69022010": ["69022090", "69120000", "39264000"],
  "82041200": ["82042000", "73181500", "82054000"],
};

console.log(`Cotação ${COT} — ${det.itens?.length} itens\n`);

const melhores = [];
for (const it of det.itens ?? []) {
  const ncm = (it.ncm ?? "").replace(/\D/g, "");
  const a0 = await aliqNcm(ncm);
  if (!a0) continue;
  const alts = ALTERNATIVAS[ncm] ?? [];
  for (const alt of alts) {
    const a1 = await aliqNcm(alt);
    if (!a1) continue;
    const dII = Math.abs((a0.ii ?? 0) - (a1.ii ?? 0));
    const dIPI = Math.abs((a0.ipi ?? 0) - (a1.ipi ?? 0));
    if (dII < 0.001 && dIPI < 0.001) continue;
    const fob = it.fobEmbarqueUS ?? it.fobTotalUS ?? 0;
    melhores.push({
      ordem: it.ordem,
      desc: (it.descPt ?? it.descOriginal ?? "").slice(0, 45),
      ncmAtual: ncm,
      ncmAlt: alt,
      iiAtual: a0.ii,
      ipiAtual: a0.ipi,
      iiAlt: a1.ii,
      ipiAlt: a1.ipi,
      dII,
      dIPI,
      fobUS: fob,
      score: fob * (dII + dIPI),
    });
  }
}

melhores.sort((a, b) => b.score - a.score);
console.log(JSON.stringify(melhores.slice(0, 8), null, 2));
if (melhores[0]) {
  const m = melhores[0];
  console.log(
    `\n★ MELHOR: ordem=${m.ordem} ${m.ncmAtual}→${m.ncmAlt} (FOB US$ ${m.fobUS}) II ${m.iiAtual}→${m.iiAlt} IPI ${m.ipiAtual}→${m.ipiAlt}`,
  );
}
