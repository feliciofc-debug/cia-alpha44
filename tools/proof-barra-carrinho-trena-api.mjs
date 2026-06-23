#!/usr/bin/env node
/** Dump + barra — cotação sim-china via API prod (carrinho + trena). */
import { createClerkClient } from "@clerk/backend";
import {
  auditarItemNcmParaPdf,
  itemBloqueiaPdfNcm,
  itemPrecisaResolucaoNcm,
  itemPodeConfirmarNcmIndividual,
  itensResolucaoNcm,
  mesclarItensInvalidosPdfAudit,
} from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT = process.argv[2] ?? "cmqgy89om000ykwaz7cd24o0a";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
if (!u) throw new Error("Nenhum usuário Clerk");
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const token = await clerk.sessions.getToken(sid, undefined, 3600);
const jwt = typeof token === "string" ? token : token.jwt;

const getRes = await fetch(`${API}/api/cotacoes/${COT}`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
if (!getRes.ok) throw new Error(`GET ${getRes.status}: ${await getRes.text()}`);
const cotacao = await getRes.json();
const alvos = (cotacao.itens ?? []).filter((i) => /carrinho|trena/i.test(i.descPt || i.descOriginal || ""));

console.log(`cotacaoId: ${COT}\n=== PASSO 1 — DUMP ===\n`);
for (const it of alvos) {
  const auditSemCtx = auditarItemNcmParaPdf(it);
  console.log(JSON.stringify({
    ordem: it.ordem,
    desc: (it.descPt || it.descOriginal || "").slice(0, 80),
    campos: {
      ncm: it.ncm,
      ncmValido: it.ncmValido,
      ncmConfianca: it.ncmConfianca,
      ncmFonte: it.ncmFonte,
      compatibilidadeProduto: it.compatibilidadeProduto,
      pdfNcmAudit: it.pdfNcmAudit,
    },
    auditSemCtx,
    itemBloqueia: itemBloqueiaPdfNcm(it),
    itemPrecisaResolucao: itemPrecisaResolucaoNcm(it),
    itemPodeConfirmarIndividual: itemPodeConfirmarNcmIndividual(it),
    quebra: itemBloqueiaPdfNcm(it) && !itemPrecisaResolucaoNcm(it) ? "SIM" : "não",
  }, null, 2));
  console.log("---");
}

const pdfRes = await fetch(`${API}/api/cotacoes/${COT}/pdf?tipo=cliente`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
let itens422 = cotacao.itens;
if (pdfRes.status === 422) {
  const body = await pdfRes.json();
  console.log("\n=== 422 PDF ===");
  console.log(JSON.stringify(body.itensInvalidos ?? [], null, 2));
  itens422 = mesclarItensInvalidosPdfAudit(cotacao.itens, body.itensInvalidos ?? []);
}

console.log("\n=== BARRA (GET enriquecido) ===");
const barraGet = itensResolucaoNcm(cotacao.itens).filter(({ item }) =>
  /carrinho|trena/i.test(item.descPt || item.descOriginal || ""),
);
for (const { ordem, item } of barraGet) {
  console.log(
    `  #${ordem} ${item.descPt} | bloqueia=${itemBloqueiaPdfNcm(item)} | resolucao=${itemPrecisaResolucaoNcm(item)} | confirmar=${itemPodeConfirmarNcmIndividual(item)}`,
  );
}
console.log(`  total GET: ${barraGet.length}`);

console.log("\n=== BARRA (após merge 422) ===");
const barra422 = itensResolucaoNcm(itens422).filter(({ item }) =>
  /carrinho|trena/i.test(item.descPt || item.descOriginal || ""),
);
for (const { ordem, item } of barra422) {
  console.log(
    `  #${ordem} ${item.descPt} | bloqueia=${itemBloqueiaPdfNcm(item)} | resolucao=${itemPrecisaResolucaoNcm(item)} | confirmar=${itemPodeConfirmarNcmIndividual(item)} | editar=sim`,
  );
}
console.log(`  total 422: ${barra422.length} (esperado: 2)`);

const ok = barraGet.length === 2 || barra422.length === 2;
process.exit(ok ? 0 : 1);
