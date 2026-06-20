#!/usr/bin/env node
/**
 * Prova: cotação 72 recalculada — FOB/kg planilha China no campo, zero pendente.
 */
import { createClerkClient } from "@clerk/backend";

const API = process.env.SMOKE_API ?? "https://api2.amzofertas.com.br/cia";
const COT_ID = process.argv[2] ?? "cmqlfuhvm000ykw2cue1whldj";

async function authHeaders() {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const uid = (await clerk.users.getUserList({ limit: 1 })).data[0]?.id;
  if (!uid) throw new Error("CLERK_SECRET_KEY ausente");
  let sid = (await clerk.sessions.getSessionList({ userId: uid, status: "active", limit: 1 })).data[0]?.id;
  if (!sid) sid = (await clerk.sessions.createSession({ userId: uid })).id;
  const jwt = (await clerk.sessions.getToken(sid, undefined, 3600)).jwt;
  return { Authorization: `Bearer ${jwt}`, "content-type": "application/json" };
}

function fobKgPrincipal(it) {
  if (it.fobKgManual != null && it.fobKgManual > 0) return it.fobKgManual;
  const ref = it.benchmark?.fobKgMedioDI ?? it.benchmark?.mediaFobKg ?? it.calibracao?.fobKgCalibrado;
  if (ref != null && ref > 0) return ref;
  if (it.pesoLiqKg > 0 && it.fobTotalUS > 0) return it.fobTotalUS / it.pesoLiqKg;
  return null;
}

const h = await authHeaders();
console.log("=== PROVA FOB planilha China — cot 72 (via /api/calcular) ===");

const det = await fetch(`${API}/api/cotacoes/${COT_ID}`, { headers: h }).then((r) => r.json());

const body = {
  cambio: det.cambio,
  freteTotalUS: det.freteTotalUS,
  adicionaisVaUS: det.adicionaisVaUS ?? 0,
  reducaoBaseUS: det.reducaoBaseUS ?? 0,
  siscomex: det.siscomex ?? 0,
  antidumpingBRL: det.antidumpingBRL ?? 0,
  cliente: det.cliente,
  benefFiscal: det.benefFiscal ?? "NENHUM",
  moeda: det.moeda ?? "USD",
  incoterm: det.incoterm ?? "FOB",
  origem: det.origem ?? "CN",
  destino: det.destino ?? "SP",
  ufEmpresa: det.ufEmpresa,
  regimeIcms: det.regimeIcms,
  despesas: det.despesas ?? [],
  outrasDespesasBaseBRL: det.outrasDespesasBaseBRL,
  params: det.params,
  itens: det.itens,
};

const calc = await fetch(`${API}/api/calcular`, {
  method: "POST",
  headers: h,
  body: JSON.stringify(body),
}).then((r) => r.json());

if (!calc.itens?.length) {
  console.error("calcular falhou", JSON.stringify(calc).slice(0, 500));
  process.exit(1);
}

const itens = calc.itens;
const pendentes = itens.filter((it) => it.fobPendente);
const balanca = itens.find((it) =>
  /balan|gancho|84233090|84238900|挂钩秤/i.test(`${it.descOriginal} ${it.descPt} ${it.ncm}`),
);

console.log(`Itens: ${itens.length} | Pendentes: ${pendentes.length}`);
console.log(`Total BRL: ${calc.financeiro?.totalBRL ?? calc.resultado?.totalBRL}`);

if (balanca) {
  const kg = fobKgPrincipal(balanca);
  console.log("\n★ Balança de gancho:");
  console.log(
    JSON.stringify(
      {
        ncm: balanca.ncm,
        fobKgCampo: kg,
        refPlanilha: balanca.benchmark?.fobKgMedioDI,
        fobPendente: balanca.fobPendente ?? false,
        fobTotalUS: balanca.fobTotalUS,
        pesoLiqKg: balanca.pesoLiqKg,
      },
      null,
      2,
    ),
  );
}

console.log("\nTodos os itens (FOB/kg):");
for (const it of itens) {
  console.log(
    `  ordem=${it.ordem} ncm=${it.ncm} fobKg=${fobKgPrincipal(it)?.toFixed(4) ?? "—"} pendente=${it.fobPendente ? "SIM" : "não"}`,
  );
}

const balancaOk =
  balanca &&
  Math.abs((fobKgPrincipal(balanca) ?? 0) - 2.8942) < 0.02 &&
  !balanca.fobPendente;
const pass =
  pendentes.length === 0 &&
  balancaOk &&
  (calc.financeiro?.totalBRL ?? calc.resultado?.totalBRL) > 0;

console.log(pass ? "\nPASS proof-fob-planilha-cot72" : "\nFAIL proof-fob-planilha-cot72");
process.exit(pass ? 0 : 1);
