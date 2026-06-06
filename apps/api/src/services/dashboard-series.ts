/** Séries mensais e projeções para gráficos (Fase 5a). */

import { prisma } from "@cia/db";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { PersistenciaIndisponivelError } from "./cotacoes-persist.js";

const TENANT_SLUG = "default";

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

function chaveMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelMes(chave: string): string {
  const [y = "", m = "1"] = chave.split("-");
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${meses[Number(m) - 1]}/${y.slice(2)}`;
}

function ultimosMeses(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(chaveMes(x));
  }
  return out;
}

export async function obterSeriesMensais(meses = 12) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error('Tenant "default" não encontrado');

  const desde = new Date();
  desde.setMonth(desde.getMonth() - (meses - 1));
  desde.setDate(1);
  desde.setHours(0, 0, 0, 0);

  const rows = await prisma.cotacao.findMany({
    where: { tenantId: tenant.id, criadoEm: { gte: desde } },
    orderBy: { criadoEm: "asc" },
  });

  const buckets = new Map<
    string,
    { processos: number; volumeBRL: number; lucroTradeBRL: number; lucroLiquidoBRL: number }
  >();

  for (const chave of ultimosMeses(meses)) {
    buckets.set(chave, { processos: 0, volumeBRL: 0, lucroTradeBRL: 0, lucroLiquidoBRL: 0 });
  }

  for (const r of rows) {
    const chave = chaveMes(r.criadoEm);
    if (!buckets.has(chave)) continue;
    const b = buckets.get(chave)!;
    const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.06;
    const resultado = r.resultadoCalculo as ResultadoCotacao | null;
    const fin = extrairResumoFinanceiro(resultado, markupPct);
    const total = numOrNull(r.totalBRL) ?? 0;

    b.processos++;
    b.volumeBRL += total;
    if (fin) {
      b.lucroTradeBRL += fin.markupBRL;
      b.lucroLiquidoBRL += fin.lucroLiquidoTradeBRL;
    }
  }

  const serie = ultimosMeses(meses).map((chave) => ({
    mes: chave,
    label: labelMes(chave),
    ...buckets.get(chave)!,
  }));

  const agora = new Date();
  const chaveAtual = chaveMes(agora);
  const mesAtual = buckets.get(chaveAtual) ?? { processos: 0, volumeBRL: 0, lucroTradeBRL: 0, lucroLiquidoBRL: 0 };
  const dia = agora.getDate();
  const diasNoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
  const diasRestantes = Math.max(0, diasNoMes - dia);

  const projecaoMensal = {
    volumeBRL: dia > 0 ? (mesAtual.volumeBRL / dia) * diasNoMes : mesAtual.volumeBRL,
    lucroTradeBRL: dia > 0 ? (mesAtual.lucroTradeBRL / dia) * diasNoMes : mesAtual.lucroTradeBRL,
    processos: dia > 0 ? Math.round((mesAtual.processos / dia) * diasNoMes) : mesAtual.processos,
  };

  const mesesComDados = serie.filter((s) => s.processos > 0);
  const ultimos3 = mesesComDados.slice(-3);
  const mediaVol =
    ultimos3.length > 0 ? ultimos3.reduce((a, s) => a + s.volumeBRL, 0) / ultimos3.length : 0;
  const mediaLucro =
    ultimos3.length > 0 ? ultimos3.reduce((a, s) => a + s.lucroTradeBRL, 0) / ultimos3.length : 0;

  const ytd = serie.filter((s) => s.mes.startsWith(String(agora.getFullYear())));
  const volumeYtd = ytd.reduce((a, s) => a + s.volumeBRL, 0);
  const lucroYtd = ytd.reduce((a, s) => a + s.lucroTradeBRL, 0);
  const mesesRestantesAno = 12 - agora.getMonth();

  const projecaoAnual = {
    volumeBRL: volumeYtd + mediaVol * mesesRestantesAno,
    lucroTradeBRL: lucroYtd + mediaLucro * mesesRestantesAno,
    baseMediaMensalVolume: mediaVol,
    baseMediaMensalLucro: mediaLucro,
  };

  return { serie, projecaoMensal, projecaoAnual, mesAtual: { ...mesAtual, chave: chaveAtual } };
}
