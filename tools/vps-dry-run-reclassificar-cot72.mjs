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
 *   PROOF_API=https://api2.amzofertas.com.br/cia \
 *   node tools/vps-dry-run-reclassificar-cot72.mjs cmqlfuhvm000ykw2cue1whldj
 */
import { createClerkClient } from "@clerk/backend";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.PROOF_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const manifestPath = process.env.COT72_BACKUP_MANIFEST;

if (!manifestPath) {
  console.error("COT72_BACKUP_MANIFEST obrigatório antes do dry-run.");
  process.exit(1);
}

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

function money(v, digits = 2) {
  return v == null ? "—" : Number(v).toFixed(digits);
}

function boolMark(v) {
  return v ? "SIM" : "não";
}

function markdown(preview, manifest) {
  const item9 = preview.itens.find((it) => /HY-5123/i.test(it.descOriginal ?? ""));
  const linhas = [
    "# Dry-run reclassificação cotação 72",
    "",
    `**Cotação:** ${preview.cotacaoId}`,
    `**API:** ${API}`,
    `**Backup manifest:** ${manifestPath}`,
    `**Backup SHA JSON:** ${manifest.sha256?.cotacaoJson ?? "—"}`,
    `**Gerado em:** ${new Date().toISOString()}`,
    "",
    "## Resumo",
    "",
    `- Itens antes/depois: ${preview.antes.totalItens}/${preview.depois.totalItens}`,
    `- Limpeza NCM injetado prevista: ${preview.limpezaNcmInjetado.itensAfetados} itens`,
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

  const h = await authHeaders();
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
