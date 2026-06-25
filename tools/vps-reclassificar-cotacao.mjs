#!/usr/bin/env node
/**
 * Reclassifica cotação persistida na VPS (corrige NCMs gravados antes do fix planilha-china).
 * Uso:
 *   source /etc/cia-alpha44/api.env
 *   COT72_TENANT_SLUG=user_user_... node tools/vps-reclassificar-cotacao.mjs [cotacaoId]
 */
import { createClerkClient } from "@clerk/backend";
import { readFile } from "node:fs/promises";

const API = process.env.PROOF_API ?? "http://127.0.0.1:3333";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const manifestPath = process.env.COT72_BACKUP_MANIFEST;
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT_REF = process.env.COT72_TENANT_SLUG ?? process.env.COT72_TENANT_ID ?? (tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : undefined);

async function exigirBackupEConfirmacao() {
  if (!manifestPath) {
    throw new Error("COT72_BACKUP_MANIFEST obrigatório antes de reclassificar.");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.cotacaoId !== COT_ID) {
    throw new Error(`Manifest é da cotação ${manifest.cotacaoId}, não ${COT_ID}.`);
  }
  if (!manifest.sha256?.cotacaoJson || !manifest.sha256?.restoreSql) {
    throw new Error("Manifest sem hashes obrigatórios de backup.");
  }
  if (TENANT_REF && ![manifest.tenantSlug, manifest.tenantId].includes(TENANT_REF)) {
    throw new Error(`Manifest é do tenant ${manifest.tenantSlug ?? manifest.tenantId}, não ${TENANT_REF}`);
  }
  if (process.env.CONFIRM_COT72_PROD !== COT_ID) {
    throw new Error(`Confirme execução real com CONFIRM_COT72_PROD=${COT_ID}`);
  }
  return manifest;
}

function clerkUserIdFromTenantSlug(tenantSlug) {
  if (!tenantSlug?.startsWith("user_")) return null;
  return tenantSlug.slice("user_".length);
}

function clerkUserIdForTenant(manifest) {
  const explicit = process.env.COT72_CLERK_USER_ID ?? process.env.CLERK_USER_ID;
  if (explicit?.trim()) return explicit.trim();

  const tenantSlug = process.env.COT72_TENANT_SLUG ?? manifest.tenantSlug;
  const derived = clerkUserIdFromTenantSlug(tenantSlug);
  if (derived) return derived;

  if (tenantSlug) {
    throw new Error(`Não consegui derivar usuário Clerk do tenant ${tenantSlug}; defina COT72_CLERK_USER_ID.`);
  }
  return null;
}

async function authHeaders(manifest) {
  const key = process.env.CLERK_SECRET_KEY?.trim();
  if (!key) throw new Error("CLERK_SECRET_KEY ausente");
  const clerk = createClerkClient({ secretKey: key });
  const uid = clerkUserIdForTenant(manifest) ?? (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("Sem usuário Clerk");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

async function main() {
  const manifest = await exigirBackupEConfirmacao();
  const h = await authHeaders(manifest);
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
