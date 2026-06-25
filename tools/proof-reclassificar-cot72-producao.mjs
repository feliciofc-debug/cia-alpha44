#!/usr/bin/env node
/**
 * Prova pós-reclassificação cotação 72 produção.
 * Aceite: descPt sem CJK; zero ncmFonte planilha-cliente*; zero aviso "declarado na planilha".
 *
 * Uso:
 *   source /etc/cia-alpha44/api.env
 *   node tools/limpar-ncm-injetado-cot72.mjs
 *   node tools/vps-reclassificar-cotacao.mjs cmqlfuhvm000ykw2cue1whldj
 *   PROOF_API=https://api2.amzofertas.com.br/cia node tools/proof-reclassificar-cot72-producao.mjs
 */
import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const API = process.env.PROOF_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const RE_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;
const EXPECTED_ITENS = Number(process.env.COT72_EXPECTED_ITENS ?? "21");
const FOB_TOLERANCE = Number(process.env.COT72_FOB_TOLERANCE_US ?? "1");
const II_TOLERANCE = Number(process.env.COT72_II_TOLERANCE_BRL ?? "50");
const manifestPath = process.env.COT72_BACKUP_MANIFEST;

function targetFob() {
  if (process.env.COT72_FOB_TARGET_US?.trim()) {
    return { label: "custom", value: Number(process.env.COT72_FOB_TARGET_US) };
  }
  const mode = process.env.COT72_FOB_TARGET_MODE?.trim();
  if (mode === "organico") return { label: "organico", value: 49726.38 };
  if (mode === "item9-confirmado") return { label: "item9-confirmado", value: 47036.67 };
  throw new Error("Defina COT72_FOB_TARGET_MODE=organico|item9-confirmado ou COT72_FOB_TARGET_US=<valor>.");
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
  return { Authorization: `Bearer ${jwt}` };
}

async function main() {
  const alvoFob = targetFob();
  const h = await authHeaders();
  const r = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h });
  const j = await r.json();
  if (!r.ok) {
    console.error(JSON.stringify(j, null, 2));
    process.exit(1);
  }

  const itens = j.itens ?? j.cotacao?.itens ?? [];
  const resultado = j.resultado ?? j.cotacao?.resultado ?? null;
  console.log(`=== PROVA cot 72 pós-reclassificar ===`);
  console.log(`API: ${API}`);
  console.log(`Itens: ${itens.length}\n`);

  const cjk = [];
  const planilhaCliente = [];
  const avisoFalso = [];
  const incompat = [];

  for (const it of itens) {
    const pt = it.descPt ?? "";
    if (RE_CJK.test(pt)) cjk.push(`ordem ${it.ordem}: ${pt.slice(0, 60)}`);
    if (it.ncmFonte === "planilha-cliente" || it.ncmFonte === "planilha-cliente-familia") {
      planilhaCliente.push(`ordem ${it.ordem} ncm=${it.ncm} fonte=${it.ncmFonte}`);
    }
    for (const a of it.ncmAvisos ?? []) {
      if (/declarado na planilha do cliente/i.test(a)) {
        avisoFalso.push(`ordem ${it.ordem}: ${a}`);
      }
      if (/incoerente/i.test(a)) {
        incompat.push(`ordem ${it.ordem}: ${a}`);
      }
    }
    if (it.compatibilidadeProduto === "incompativel") {
      incompat.push(`ordem ${it.ordem}: compatibilidadeProduto=incompativel ncm=${it.ncm}`);
    }
  }

  const passItens = itens.length === EXPECTED_ITENS;
  const passCjk = cjk.length === 0;
  const passFonte = planilhaCliente.length === 0;
  const passAviso = avisoFalso.length === 0;
  const passIncompat = incompat.length === 0;
  const fobItens = itens.reduce((s, it) => s + (Number(it.fobTotalUS) || 0), 0);
  const fobResultado = Number(resultado?.entrada?.fobTotalUS ?? fobItens);
  const passFob = Math.abs(fobResultado - alvoFob.value) <= FOB_TOLERANCE;
  const iiTotal = resultado?.entrada?.iiTotal != null ? Number(resultado.entrada.iiTotal) : null;
  const alvoIi = process.env.COT72_II_TARGET_BRL?.trim() ? Number(process.env.COT72_II_TARGET_BRL) : null;
  const passIi = alvoIi == null || (iiTotal != null && Math.abs(iiTotal - alvoIi) <= II_TOLERANCE);

  console.log(`itens = ${EXPECTED_ITENS}: ${passItens ? "OK" : "FAIL"} (${itens.length})`);
  console.log(`descPt sem CJK: ${passCjk ? "OK" : "FAIL"} (${cjk.length})`);
  if (cjk.length) console.log(cjk.join("\n"));
  console.log(`sem planilha-cliente*: ${passFonte ? "OK" : "FAIL"} (${planilhaCliente.length})`);
  if (planilhaCliente.length) console.log(planilhaCliente.join("\n"));
  console.log(`sem aviso falso: ${passAviso ? "OK" : "FAIL"} (${avisoFalso.length})`);
  if (avisoFalso.length) console.log(avisoFalso.join("\n"));
  console.log(`sem incompatibilidade produto×NCM: ${passIncompat ? "OK" : "FAIL"} (${incompat.length})`);
  if (incompat.length) console.log(incompat.join("\n"));
  console.log(`FOB alvo ${alvoFob.label}: ${passFob ? "OK" : "FAIL"} (atual US$ ${fobResultado.toFixed(2)} alvo US$ ${alvoFob.value.toFixed(2)})`);
  if (alvoIi != null) {
    console.log(`II alvo: ${passIi ? "OK" : "FAIL"} (atual ${iiTotal == null ? "—" : `R$ ${iiTotal.toFixed(2)}`} alvo R$ ${alvoIi.toFixed(2)})`);
  }

  const fontes = [...new Set(itens.map((i) => i.ncmFonte).filter(Boolean))];
  console.log(`\nFontes NCM: ${fontes.join(", ") || "—"}`);

  const item9 = itens.find((i) => /HY-5123/i.test(i.descOriginal ?? ""));
  const passItem9 = Boolean(item9);
  if (item9) {
    console.log(`\nItem 9 / HY-5123:`);
    console.log(`  descPt: ${(item9.descPt ?? "").slice(0, 100)}`);
    console.log(`  ncm=${item9.ncm} fonte=${item9.ncmFonte} embarque=${item9.ncmEmbarque ?? "null"}`);
    console.log(`  fobTotalUS=${Number(item9.fobTotalUS ?? 0).toFixed(2)}`);
  } else {
    console.log("\nFAIL item 9 / HY-5123 não encontrado");
  }

  let passOutrasCotacoes = true;
  if (manifestPath) {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const beforePath = manifest.paths?.tenantCotacoesBefore;
    const before = JSON.parse(await readFile(beforePath, "utf8"));
    const p = new PrismaClient();
    try {
      const after = await p.cotacao.findMany({
        where: { tenantId: manifest.tenantId },
        select: { id: true, atualizadoEm: true },
      });
      const afterMap = new Map(after.map((c) => [c.id, c.atualizadoEm.toISOString()]));
      const alteradas = [];
      for (const c of before) {
        if (c.id === COT_ID) continue;
        const atual = afterMap.get(c.id);
        if (atual && atual !== c.atualizadoEm) {
          alteradas.push(`${c.id}: ${c.atualizadoEm} -> ${atual}`);
        }
      }
      const cotAntes = before.find((c) => c.id === COT_ID);
      const cotDepois = afterMap.get(COT_ID);
      const cot72Mudou = cotAntes && cotDepois && cotDepois !== cotAntes.atualizadoEm;
      passOutrasCotacoes = alteradas.length === 0 && Boolean(cot72Mudou);
      console.log(`\noutras cotações intocadas: ${alteradas.length === 0 ? "OK" : "FAIL"} (${alteradas.length})`);
      if (alteradas.length) console.log(alteradas.join("\n"));
      console.log(`updatedAt cot 72 mudou: ${cot72Mudou ? "OK" : "FAIL"}`);
    } finally {
      await p.$disconnect();
    }

    const dryRunPath = join(manifest.paths.dir, "dry-run-reclassificar-cot72.json");
    if (existsSync(dryRunPath)) {
      const dry = JSON.parse(await readFile(dryRunPath, "utf8"));
      console.log(`dry-run usado como referência: ${dry.dryRun === true ? "OK" : "FAIL"} (${dryRunPath})`);
    }
  } else {
    console.log("\nWARN: COT72_BACKUP_MANIFEST ausente — não provei outras cotações intocadas.");
    passOutrasCotacoes = false;
  }

  const pass =
    passItens &&
    passCjk &&
    passFonte &&
    passAviso &&
    passIncompat &&
    passFob &&
    passIi &&
    passItem9 &&
    passOutrasCotacoes;
  console.log(pass ? "\nPASS proof-reclassificar-cot72-producao" : "\nFAIL proof-reclassificar-cot72-producao");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
