#!/usr/bin/env node
/**
 * Smoke pós-deploy 330e05a — armadilha LIMPA via API.
 * a) deleta cotação suja  b) upload+classifica+salva  c) valida FIX1+FIX2  d) PDF 200
 *
 * Uso:
 *   SMOKE_DESTRUCTIVE=1 CLERK_SECRET_KEY=... node tools/smoke-armadilha-fix330e05a.mjs [planilha.xlsx]
 */
import fs from "node:fs";
import path from "node:path";
import { createClerkClient } from "@clerk/backend";
import {
  itemBloqueiaPdfNcm,
  itemPodeConfirmarNcmIndividual,
  itensBloqueandoPdf,
  ncm8Limpo,
} from "@cia/shared";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_SUJA = "cmqfu34co000ukwgg6d0e8pcd";
const ORDEM_CHAPA = 13;
const XLSX =
  process.argv[2] ??
  process.env.SMOKE_ARMADILHA_XLSX ??
  path.join(process.env.USERPROFILE ?? ".", "Desktop", "testes apha44", "sim-ARMADILHA-cliente.xlsx");

if (!process.env.SMOKE_DESTRUCTIVE) {
  console.error("Exige SMOKE_DESTRUCTIVE=1");
  process.exit(2);
}
if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error("Exige CLERK_SECRET_KEY");
  process.exit(2);
}
if (!fs.existsSync(XLSX)) {
  console.error("Planilha não encontrada:", XLSX);
  process.exit(2);
}

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
if (!u) throw new Error("Nenhum usuário Clerk");
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const hJson = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
const hAuth = { Authorization: `Bearer ${jwt}` };

function pos4(ncm) {
  return ncm8Limpo(ncm).slice(0, 4);
}

async function parsePlanilha() {
  const buf = fs.readFileSync(XLSX);
  const boundary = `----smoke${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="sim-ARMADILHA-cliente.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${API}/api/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`parse ${res.status}: ${(await res.text()).slice(0, 400)}`);
  return res.json();
}

async function classificar(linhas) {
  const t0 = Date.now();
  const res = await fetch(`${API}/api/classificar`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify({ linhas }),
  });
  if (!res.ok) throw new Error(`classificar ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  console.log(`  classificar OK (${((Date.now() - t0) / 1000).toFixed(1)}s, ${data.itens?.length} itens, provider=${data.provider})`);
  return data;
}

async function salvar(itens, provider) {
  const cambio = await fetch(`${API}/api/cambio?moeda=USD`, { headers: hAuth }).then((r) => r.json());
  const cotacao = {
    cliente: "Smoke armadilha FIX330e05a",
    benefFiscal: "ALAGOAS",
    moeda: "US$",
    cambio: cambio.cotacaoVenda ?? 5.2,
    freteTotalUS: 500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 154.23,
    antidumpingBRL: 0,
    incoterm: "CFR",
    origem: "RJ",
    destino: "SP",
    itens,
    despesas: [],
    params: {
      markupPct: 0.06,
      pisSaida: 0.0165,
      cofinsSaida: 0.076,
      icmsSaida: 0.04,
      csllSobreMarkup: 0.09,
      irrfAliq: 0.25,
      irrfBaseNotaPct: 0.027,
      ipiTetoAliqMedia: 0.15,
      icmsEntrada: 0,
    },
  };
  const calc = await fetch(`${API}/api/calcular`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify(cotacao),
  });
  if (!calc.ok) throw new Error(`calcular ${calc.status}: ${(await calc.text()).slice(0, 400)}`);
  const calcBody = await calc.json();
  const save = await fetch(`${API}/api/cotacoes`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify({
      cotacao: { ...cotacao, itens: calcBody.itens },
      itens: calcBody.itens,
      resultado: calcBody.resultado,
      provider: provider ?? calcBody.provider,
    }),
  });
  if (!save.ok) throw new Error(`salvar ${save.status}: ${(await save.text()).slice(0, 400)}`);
  return save.json();
}

async function getCot(id) {
  const res = await fetch(`${API}/api/cotacoes/${id}`, { headers: hAuth });
  if (!res.ok) throw new Error(`GET cot ${res.status}`);
  return res.json();
}

async function getPdf(id) {
  return fetch(`${API}/api/cotacoes/${id}/pdf?tipo=cliente`, { headers: hAuth });
}

const checks = [];
console.log("=== Smoke armadilha FIX 330e05a ===\n");

console.log("[a] DELETE cotação suja", COT_SUJA);
const del = await fetch(`${API}/api/cotacoes/${COT_SUJA}`, { method: "DELETE", headers: hAuth });
console.log(`  HTTP ${del.status}${del.status === 404 ? " (já ausente)" : ""}`);
checks.push(["delete_suja", del.ok || del.status === 404]);

console.log("\n[b] Upload + classificar armadilha limpa");
console.log("  planilha:", XLSX);
const parsed = await parsePlanilha();
console.log(`  parse: ${parsed.linhas?.length ?? parsed.totalLinhas} linhas`);
const { itens: classificados, provider } = await classificar(parsed.linhas);
const saved = await salvar(classificados, provider);
const COT = saved.id;
console.log(`  cotação nova: ${COT} (${saved.itens?.length} itens)`);

console.log("\n[c] FIX 2 — chapas cap 72 (nunca incompatível)");
const chapas = saved.itens.filter(
  (it) =>
    pos4(it.ncm).startsWith("72") ||
    /CHP|chapa|Stahlblech|laminad/i.test(it.descOriginal || it.descPt || ""),
);
let fix2Ok = chapas.length >= 5;
for (const it of chapas) {
  const ok = it.compatibilidadeProduto !== "incompativel";
  console.log(
    `  #${it.ordem + 1} ${(it.descOriginal || "").slice(0, 35)} NCM=${it.ncm} compat=${it.compatibilidadeProduto} fam=${it.familiaProdutoId ?? "-"}`,
  );
  if (!ok) fix2Ok = false;
}
checks.push(["fix2_chapas", fix2Ok]);

console.log("\n[c] Controles capítulo");
const caps = { "8711": 0, "9617": 0, "9405": 0 };
for (const it of saved.itens) {
  const p = pos4(it.ncm);
  if (p.startsWith("8711")) caps["8711"]++;
  else if (p.startsWith("9617")) caps["9617"]++;
  else if (p.startsWith("9405")) caps["9405"]++;
}
console.log("  caps", caps);
const ctrlOk = caps["8711"] >= 2 && caps["9617"] >= 2 && caps["9405"] >= 2;
checks.push(["controles", ctrlOk]);

console.log("\n[d] Caminho completo — lote + chapa + override + PDF");
let det = await getCot(COT);

console.log("  [d1] confirmar-ncm-lote (válidos)");
const lote = await fetch(`${API}/api/cotacoes/${COT}/itens/confirmar-ncm-lote`, {
  method: "POST",
  headers: hJson,
  body: JSON.stringify({ confirmadoPor: "smoke-fix330e05a-lote" }),
});
const loteBody = await lote.json();
console.log(`  HTTP ${lote.status} aprovados=${loteBody.aprovados} pulados=${loteBody.pulados}`);
det = lote.ok ? loteBody : det;

console.log("  [d2] PATCH chapa ordem", ORDEM_CHAPA, "→ 72085200");
const patch = await fetch(`${API}/api/cotacoes/${COT}/itens/${ORDEM_CHAPA}/ncm`, {
  method: "PATCH",
  headers: hJson,
  body: JSON.stringify({ ncm: "72085200" }),
});
const patchBody = await patch.json();
const chapaPosPatch = patchBody.itens?.[ORDEM_CHAPA];
console.log(
  `  HTTP ${patch.status} compat=${chapaPosPatch?.compatibilidadeProduto} incompativel=${chapaPosPatch?.compatibilidadeProduto === "incompativel"}`,
);
checks.push(["chapa_pos_patch", patch.ok && chapaPosPatch?.compatibilidadeProduto !== "incompativel"]);
det = patch.ok ? patchBody : det;

let chapa = det.itens[ORDEM_CHAPA];
if (itemBloqueiaPdfNcm(chapa) && itemPodeConfirmarNcmIndividual(chapa)) {
  console.log("  [d3] override individual chapa");
  const conf = await fetch(`${API}/api/cotacoes/${COT}/itens/${ORDEM_CHAPA}/confirmar-ncm`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify({ confirmadoPor: "smoke-fix330e05a-override" }),
  });
  det = conf.ok ? await conf.json() : det;
  chapa = det.itens[ORDEM_CHAPA];
  console.log(`  HTTP ${conf.status} revisado=${chapa?.ncmRevisadoHumano}`);
}

const inc = det.itens.find((it) => it.compatibilidadeProduto === "incompativel" && !it.ncmRevisadoHumano);
if (inc) {
  console.log(`  [d4] FIX1 — override item incompatível ordem ${inc.ordem} NCM=${inc.ncm}`);
  const confInc = await fetch(`${API}/api/cotacoes/${COT}/itens/${inc.ordem}/confirmar-ncm`, {
    method: "POST",
    headers: hJson,
    body: JSON.stringify({ confirmadoPor: "smoke-fix330e05a-fix1" }),
  });
  det = confInc.ok ? await confInc.json() : det;
  console.log(`  HTTP ${confInc.status}`);
  const pdfAntesOverride = await getPdf(COT);
  console.log(`  PDF após override incompatível: HTTP ${pdfAntesOverride.status}`);
  checks.push(["fix1_pdf_pos_override", pdfAntesOverride.status === 200]);
} else {
  console.log("  [d4] SKIP FIX1 isolado — nenhum incompatível pendente após lote");
  checks.push(["fix1_pdf_pos_override", true]);
}

const bloq = itensBloqueandoPdf(det.itens);
console.log(`  bloqueando_pdf=${bloq.length}`);
const pdfFinal = await getPdf(COT);
const pdfTxt = pdfFinal.status !== 200 ? await pdfFinal.text() : "";
console.log(`  GET /pdf final: HTTP ${pdfFinal.status} ctype=${pdfFinal.headers.get("content-type")}`);
if (pdfTxt) console.log("  erro:", pdfTxt.slice(0, 350));
checks.push(["pdf_final_200", pdfFinal.status === 200]);

console.log("\n=== RESUMO ===");
console.log("cotacao_nova:", COT);
let fail = 0;
for (const [k, v] of checks) {
  console.log(`  ${k}: ${v ? "PASS" : "FAIL"}`);
  if (!v) fail++;
}
process.exit(fail ? 1 : 0);
