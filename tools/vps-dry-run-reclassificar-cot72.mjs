#!/usr/bin/env node
/**
 * Dry-run da reclassificação cot 72: gera diff pré/pós SEM gravar.
 *
 * Requer API com rota /reclassificar-dry-run (este PR). Se a API antiga responder
 * 404, o script falha sem chamar a rota real.
 *
 * Uso:
 *   source /etc/cia-alpha44/api.env
 *   COT72_BACKUP_MANIFEST=/tmp/.../manifest.json \
 *   COT72_TENANT_SLUG=user_user_... \
 *   PROOF_API=https://api2.amzofertas.com.br/cia \
 *   node tools/vps-dry-run-reclassificar-cot72.mjs cmqlfuhvm000ykw2cue1whldj
 */
import { createClerkClient } from "@clerk/backend";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.PROOF_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const manifestPath = process.env.COT72_BACKUP_MANIFEST;
const tenantArgIdx = process.argv.indexOf("--tenant");
const TENANT_REF = process.env.COT72_TENANT_SLUG ?? process.env.COT72_TENANT_ID ?? (tenantArgIdx >= 0 ? process.argv[tenantArgIdx + 1] : undefined);

if (!manifestPath) {
  console.error("COT72_BACKUP_MANIFEST obrigatório antes do dry-run.");
  process.exit(1);
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

function money(v, digits = 2) {
  return v == null ? "—" : Number(v).toFixed(digits);
}

function boolMark(v) {
  return v ? "SIM" : "não";
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([value, count]) => `${value}: ${count}`).join(", ") || "—";
}

function markdown(preview, manifest) {
  const item9 = preview.itens.find((it) => /HY-5123/i.test(it.descOriginal ?? ""));
  const fontesDepois = countBy(preview.itens.map((it) => it.depois.ncmFonte ?? "sem-fonte"));
  const motivosLimpeza = countBy((preview.limpezaNcmInjetado.itens ?? []).map((it) => it.motivo ?? "sem-motivo"));
  const linhas = [
    "# Dry-run reclassificação cotação 72",
    "",
    `**Cotação:** ${preview.cotacaoId}`,
    `**API:** ${API}`,
    `**Backup manifest:** ${manifestPath}`,
    `**Backup SHA JSON:** ${manifest.sha256?.cotacaoJson ?? "—"}`,
    `**Diagnóstico runtime:** ${preview.diagnosticoCot72?.marker ?? "ausente"}`,
    `**Gerado em:** ${new Date().toISOString()}`,
    "",
    "## Resumo",
    "",
    `- Itens antes/depois: ${preview.antes.totalItens}/${preview.depois.totalItens}`,
    `- Limpeza NCM injetado prevista: ${preview.limpezaNcmInjetado.itensAfetados} itens`,
    `- Motivos da limpeza: ${motivosLimpeza}`,
    `- Fontes NCM depois: ${fontesDepois}`,
    `- Markup antes/depois: ${(Number(preview.antes.markupPct ?? 0) * 100).toFixed(2)}% / ${(Number(preview.depois.markupPct ?? 0) * 100).toFixed(2)}%`,
    `- FOB antes: US$ ${money(preview.antes.fobTotalUS)}`,
    `- FOB depois: US$ ${money(preview.depois.fobTotalUS)}`,
    `- II antes/depois: R$ ${money(preview.antes.iiTotalBRL)} / R$ ${money(preview.depois.iiTotalBRL)}`,
    `- IPI antes/depois: R$ ${money(preview.antes.ipiTotalBRL)} / R$ ${money(preview.depois.ipiTotalBRL)}`,
    `- PIS antes/depois: R$ ${money(preview.antes.pisTotalBRL)} / R$ ${money(preview.depois.pisTotalBRL)}`,
    `- COFINS antes/depois: R$ ${money(preview.antes.cofinsTotalBRL)} / R$ ${money(preview.depois.cofinsTotalBRL)}`,
    "",
    "## Item 9 / HY-5123",
    "",
  ];

  if (item9) {
    linhas.push(
      `- NCM antes/depois: ${item9.antes.ncm} (${item9.antes.ncmFonte ?? "—"}) -> ${item9.depois.ncm} (${item9.depois.ncmFonte ?? "—"})`,
      `- FOB antes/depois: US$ ${money(item9.antes.fobTotalUS)} -> US$ ${money(item9.depois.fobTotalUS)}`,
      `- II antes/depois: R$ ${money(item9.antes.impostosEntrada.ii)} -> R$ ${money(item9.depois.impostosEntrada.ii)}`,
    );
  } else {
    linhas.push("- HY-5123 não encontrado no dry-run.");
  }

  if (preview.diagnosticoCot72?.item0) {
    const diag = preview.diagnosticoCot72;
    linhas.push(
      "",
      "## Diagnóstico runtime item 0",
      "",
      `- Marker: ${diag.marker}`,
      `- Cotação sem coluna NCM real: ${diag.cotacaoSemColunaNcmReal ? "SIM" : "não"}`,
      `- Cache hits/misses/humanos/total: ${diag.classificacaoCache?.hits ?? "—"}/${diag.classificacaoCache?.misses ?? "—"}/${diag.classificacaoCache?.humanos ?? "—"}/${diag.classificacaoCache?.total ?? "—"}`,
      `- Ordem: ${diag.item0.ordem}`,
      `- Produto: ${diag.item0.descOriginal ?? "—"}`,
      `- Meta antes: status=${diag.item0.metaAntes?.ncmEmbarqueStatus ?? "null"} ncmEmbarque=${diag.item0.metaAntes?.ncmEmbarque ?? "null"} ncmPlanilhaOriginal=${diag.item0.metaAntes?.ncmPlanilhaOriginal ?? "null"} ncmFonte=${diag.item0.metaAntes?.ncmFonte ?? "null"}`,
      `- Meta depois saneamento: status=${diag.item0.metaDepoisSanitizacao?.ncmEmbarqueStatus ?? "null"} ncmEmbarque=${diag.item0.metaDepoisSanitizacao?.ncmEmbarque ?? "null"} ncmPlanilhaOriginal=${diag.item0.metaDepoisSanitizacao?.ncmPlanilhaOriginal ?? "null"} ncmReferencia=${diag.item0.metaDepoisSanitizacao?.ncmReferencia ?? "null"}`,
      `- Limpeza: ${diag.item0.limpeza?.motivo ?? "nao-limpou"}`,
      `- linha.ncm após saneamento: ${diag.item0.linhaNcmAposSanitizacao ?? "null"}`,
      `- Trace classificação: decisão=${diag.item0.traceClassificacao?.decisao ?? "ausente"} ignorarCacheQuandoSemNcmReal=${String(diag.item0.traceClassificacao?.ignorarCacheQuandoSemNcmReal)} temColunaNcmReal=${String(diag.item0.traceClassificacao?.temColunaNcmReal)} devePularCache=${String(diag.item0.traceClassificacao?.devePularCache)} cacheLookupConsultado=${String(diag.item0.traceClassificacao?.cacheLookupConsultado)} cacheEncontrado=${String(diag.item0.traceClassificacao?.cacheEncontrado)} cacheProvedor=${diag.item0.traceClassificacao?.cacheProvedor ?? "null"} cacheToxico=${String(diag.item0.traceClassificacao?.cacheToxico)}`,
      `- Decisão depois: fonte=${diag.item0.fonteDepois ?? "null"} ncm=${diag.item0.ncmDepois ?? "null"}`,
    );
  }

  linhas.push(
    "",
    "## Diff por item",
    "",
    "| Ordem | Produto | NCM | Fonte | FOB US$ | II | IPI | PIS | COFINS | Desc PT mudou? |",
    "|---:|---|---|---|---:|---:|---:|---:|---:|---|",
  );

  for (const it of preview.itens) {
    const produto = String(it.descOriginal ?? "").replaceAll("|", "/").slice(0, 70);
    linhas.push(
      `| ${it.ordem} | ${produto} | ${it.antes.ncm} -> ${it.depois.ncm} | ${it.antes.ncmFonte ?? "—"} -> ${it.depois.ncmFonte ?? "—"} | ${money(it.antes.fobTotalUS)} -> ${money(it.depois.fobTotalUS)} | ${money(it.antes.impostosEntrada.ii)} -> ${money(it.depois.impostosEntrada.ii)} | ${money(it.antes.impostosEntrada.ipi)} -> ${money(it.depois.impostosEntrada.ipi)} | ${money(it.antes.impostosEntrada.pis)} -> ${money(it.depois.impostosEntrada.pis)} | ${money(it.antes.impostosEntrada.cofins)} -> ${money(it.depois.impostosEntrada.cofins)} | ${boolMark(it.mudou.descPt)} |`,
    );
  }

  linhas.push("");
  return linhas.join("\n");
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.cotacaoId !== COT_ID) {
    throw new Error(`Manifest é da cotação ${manifest.cotacaoId}, não ${COT_ID}`);
  }
  if (TENANT_REF && ![manifest.tenantSlug, manifest.tenantId].includes(TENANT_REF)) {
    throw new Error(`Manifest é do tenant ${manifest.tenantSlug ?? manifest.tenantId}, não ${TENANT_REF}`);
  }

  const h = await authHeaders(manifest);
  const r = await fetch(`${API}/api/cotacoes/${COT_ID}/reclassificar-dry-run`, {
    method: "POST",
    headers: h,
    body: "{}",
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error(JSON.stringify(j, null, 2));
    throw new Error(`Dry-run falhou HTTP ${r.status}. A API precisa estar no commit deste PR antes da simulação.`);
  }
  if (j.dryRun !== true) {
    throw new Error("Resposta não é dry-run=true; recusando continuar para evitar falso dry-run.");
  }

  const jsonPath = join(manifest.paths.dir, "dry-run-reclassificar-cot72.json");
  const mdPath = join(manifest.paths.dir, "dry-run-reclassificar-cot72.md");
  await writeFile(jsonPath, `${JSON.stringify(j, null, 2)}\n`);
  await writeFile(mdPath, markdown(j, manifest));

  console.log(`PASS dry-run reclassificar cot 72`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Markdown: ${mdPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
