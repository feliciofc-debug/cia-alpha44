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

const API = process.env.PROOF_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? process.env.COT72_ID ?? "cmqlfuhvm000ykw2cue1whldj";
const RE_CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/;

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
  const h = await authHeaders();
  const r = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h });
  const j = await r.json();
  if (!r.ok) {
    console.error(JSON.stringify(j, null, 2));
    process.exit(1);
  }

  const itens = j.itens ?? j.cotacao?.itens ?? [];
  console.log(`=== PROVA cot 72 pós-reclassificar ===`);
  console.log(`API: ${API}`);
  console.log(`Itens: ${itens.length}\n`);

  const cjk = [];
  const planilhaCliente = [];
  const avisoFalso = [];

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
    }
  }

  const passCjk = cjk.length === 0;
  const passFonte = planilhaCliente.length === 0;
  const passAviso = avisoFalso.length === 0;

  console.log(`descPt sem CJK: ${passCjk ? "OK" : "FAIL"} (${cjk.length})`);
  if (cjk.length) console.log(cjk.join("\n"));
  console.log(`sem planilha-cliente*: ${passFonte ? "OK" : "FAIL"} (${planilhaCliente.length})`);
  if (planilhaCliente.length) console.log(planilhaCliente.join("\n"));
  console.log(`sem aviso falso: ${passAviso ? "OK" : "FAIL"} (${avisoFalso.length})`);
  if (avisoFalso.length) console.log(avisoFalso.join("\n"));

  const fontes = [...new Set(itens.map((i) => i.ncmFonte).filter(Boolean))];
  console.log(`\nFontes NCM: ${fontes.join(", ") || "—"}`);

  const hy97 = itens.find((i) => (i.descOriginal ?? "").startsWith("HY-97"));
  if (hy97) {
    console.log(`\nHY-97 amostra:`);
    console.log(`  descPt: ${(hy97.descPt ?? "").slice(0, 80)}`);
    console.log(`  ncm=${hy97.ncm} fonte=${hy97.ncmFonte} embarque=${hy97.ncmEmbarque ?? "null"}`);
  }

  const pass = passCjk && passFonte && passAviso;
  console.log(pass ? "\nPASS proof-reclassificar-cot72-producao" : "\nFAIL proof-reclassificar-cot72-producao");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
