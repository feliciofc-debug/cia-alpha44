#!/usr/bin/env node
/**
 * Trace moto 3000W vs 2000W — parse + N runs classificar + famílias/passe1 local.
 */
import fs from "node:fs";
import { createClerkClient } from "@clerk/backend";
import {
  detectarFamilias,
  montarCandidatosPasse1,
  criarNcmCatalog,
  loadNcmVigente,
  textoDeteccaoFamilia,
  enriquecerTextoClassificacao,
} from "@cia/pipeline";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const XLSX =
  process.argv[2] ??
  "C:/Users/usuario/Desktop/testes apha44/sim-ARMADILHA-cliente.xlsx";
const RUNS = Number(process.env.RUNS ?? "3");

if (!process.env.CLERK_SECRET_KEY?.trim()) {
  console.error("CLERK_SECRET_KEY required");
  process.exit(2);
}

const catalog = criarNcmCatalog(loadNcmVigente());
const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY.trim() });
const u = (await clerk.users.getUserList({ limit: 1 })).data[0];
let sid = (await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 })).data[0]?.id;
if (!sid) sid = (await clerk.sessions.createSession({ userId: u.id })).id;
const jwt = await clerk.sessions.getToken(sid, undefined, 3600).then((t) => (typeof t === "string" ? t : t.jwt));
const hJson = { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };

async function parsePlanilha() {
  const buf = fs.readFileSync(XLSX);
  const boundary = `----trace${Date.now()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="arm.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
    ),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const res = await fetch(`${API}/api/parse`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "content-type": `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`parse ${res.status}: ${await res.text()}`);
  return res.json();
}

function analiseLocal(l, descPt) {
  const detInput = {
    descOriginal: textoDeteccaoFamilia(l.descOriginal, descPt),
    uso: l.uso,
  };
  const det = detectarFamilias(detInput);
  const cands = montarCandidatosPasse1(catalog, descPt ?? l.descOriginal, null, 25, detInput);
  const texto = enriquecerTextoClassificacao(detInput.descOriginal, det.familias[0]?.familia ?? null);
  const hits = catalog.buscarPorTexto(texto, undefined, 10).filter((x) => x.score >= 0.12);
  return { det, cands, hits };
}

const parsed = await parsePlanilha();
const linhas = parsed.linhas ?? [];
console.log("Linhas parse:", linhas.length, "\n");

for (let idx = 0; idx < Math.min(2, linhas.length); idx++) {
  const l = linhas[idx];
  console.log(`========== ITEM ${idx + 1} ==========`);
  console.log("descOriginal:", l.descOriginal);
  console.log("material:", l.material ?? "-", "| uso:", l.uso ?? "-");
  console.log("");

  const results = [];
  for (let r = 0; r < RUNS; r++) {
    const t0 = Date.now();
    const res = await fetch(`${API}/api/classificar`, {
      method: "POST",
      headers: hJson,
      body: JSON.stringify({ linhas: [l] }),
    });
    const body = await res.json();
    const it = body.itens?.[0];
    const ms = Date.now() - t0;
    results.push({
      run: r + 1,
      ncm: it?.ncm,
      compat: it?.compatibilidadeProduto,
      descPt: it?.descPt?.slice(0, 120),
      pos1: it?.ncmCandidatos?.[0]?.ncm,
      avisos: it?.ncmAvisos,
      ms,
    });
    if (r === 0) {
      const loc = analiseLocal(l, it?.descPt);
      console.log("Famílias:", loc.det.familias.map((f) => f.familia.id).join(", "));
      console.log("Conflito:", loc.det.conflito);
      console.log("Passe1 pos4:", loc.cands.map((c) => c.posicao4).join(", "));
      console.log("9617 candidato?", loc.cands.some((c) => c.posicao4 === "9617"));
      console.log(
        "Busca top8:",
        loc.hits.slice(0, 8).map((h) => `${h.ncm.slice(0, 4)}=${h.score.toFixed(2)}`).join(" "),
      );
      console.log("descPt run1:", it?.descPt);
      console.log("");
    }
  }
  for (const r of results) {
    console.log(
      `  run${r.run} (${r.ms}ms): NCM=${r.ncm} compat=${r.compat} | avisos: ${(r.avisos ?? []).slice(0, 2).join("; ")}`,
    );
  }
  const ncms = [...new Set(results.map((r) => r.ncm))];
  console.log(`  → ${ncms.length} NCM(s) distintos: ${ncms.join(", ")} ${ncms.length > 1 ? "⚠ INSTÁVEL" : "✓ estável"}`);
  console.log("");
}
