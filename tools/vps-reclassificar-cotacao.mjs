#!/usr/bin/env node
/**
 * Reclassifica cotação persistida na VPS (corrige NCMs gravados antes do fix planilha-china).
 * Uso: source /etc/cia-alpha44/api.env && node tools/vps-reclassificar-cotacao.mjs [cotacaoId]
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.PROOF_API ?? "http://127.0.0.1:3333";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";

async function authHeaders() {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error("CLERK_SECRET_KEY ausente");
  const clerk = createClerkClient({ secretKey: key });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("Sem usuário Clerk");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

async function main() {
  const h = await authHeaders();
  console.log(`Reclassificando cotação ${COT_ID}...`);
  const r = await fetch(`${API}/api/cotacoes/${COT_ID}/reclassificar`, {
    method: "POST",
    headers: h,
    body: "{}",
  });
  const j = await r.json();
  if (!r.ok) {
    console.error(JSON.stringify(j, null, 2));
    process.exit(1);
  }
  const itens = j.itens ?? [];
  const fob = itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
  const ii = j.resultado?.impostosEntrada?.ii ?? j.resultado?.ii ?? null;
  console.log(`Itens: ${itens.length}`);
  console.log(`FOB Σ: US$ ${fob.toFixed(2)}`);
  console.log(`Fontes NCM: ${[...new Set(itens.map((i) => i.ncmFonte))].join(", ")}`);
  const toxic = itens.filter((i) => i.ncmFonte === "planilha-china");
  if (toxic.length) {
    console.error(`ERRO: ${toxic.length} itens ainda com planilha-china`);
    process.exit(1);
  }
  if (ii != null) console.log(`II: R$ ${Number(ii).toFixed(2)}`);
  console.log("OK — reclassificação concluída.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
