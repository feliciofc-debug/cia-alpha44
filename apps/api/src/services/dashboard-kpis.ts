/** KPIs agregados para o painel executivo (Etapa 4). */

import { prisma } from "@cia/db";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { PersistenciaIndisponivelError } from "./cotacoes-persist.js";
import { ensureTenant } from "../auth/tenant.js";

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function inicioDoDia(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function inicioDaSemana(d = new Date()): Date {
  const x = inicioDoDia(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function inicioDoMes(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

export async function obterDashboardKpis(tenantSlug: string) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const tid = await ensureTenant(tenantSlug);
  const agora = new Date();
  const baseWhere = { tenantId: tid };

  const [rows, totalCotacoes, cotacoesHoje, cotacoesSemana, cotacoesMes] = await Promise.all([
    prisma.cotacao.findMany({
      where: baseWhere,
      orderBy: { criadoEm: "desc" },
      take: 200,
      include: { _count: { select: { itens: true } } },
    }),
    prisma.cotacao.count({ where: baseWhere }),
    prisma.cotacao.count({ where: { ...baseWhere, criadoEm: { gte: inicioDoDia(agora) } } }),
    prisma.cotacao.count({ where: { ...baseWhere, criadoEm: { gte: inicioDaSemana(agora) } } }),
    prisma.cotacao.count({ where: { ...baseWhere, criadoEm: { gte: inicioDoMes(agora) } } }),
  ]);

  let volumeOrcadoBRL = 0;
  let lucroTradeTotalBRL = 0;
  let somaMarkupPct = 0;
  let comMarkup = 0;
  const porCanal: Record<string, number> = {};
  const destinoMap = new Map<string, { qtd: number; volumeBRL: number }>();

  for (const r of rows) {
    const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.06;
    const resultado = r.resultadoCalculo as ResultadoCotacao | null;
    const financeiro = extrairResumoFinanceiro(resultado, markupPct);
    const total = numOrNull(r.totalBRL) ?? 0;

    if (total > 0) volumeOrcadoBRL += total;
    if (financeiro) {
      lucroTradeTotalBRL += financeiro.markupBRL;
      somaMarkupPct += financeiro.markupPct;
      comMarkup++;
    }

    const canal = r.canalPredominante ?? "SEM_CANAL";
    porCanal[canal] = (porCanal[canal] ?? 0) + 1;

    const dest = r.destino || "—";
    const prev = destinoMap.get(dest) ?? { qtd: 0, volumeBRL: 0 };
    destinoMap.set(dest, { qtd: prev.qtd + 1, volumeBRL: prev.volumeBRL + total });
  }

  const porDestino = [...destinoMap.entries()]
    .map(([uf, v]) => ({ uf, qtd: v.qtd, volumeBRL: v.volumeBRL }))
    .sort((a, b) => b.volumeBRL - a.volumeBRL)
    .slice(0, 8);

  const recentes = rows.slice(0, 5).map((r) => {
    const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.06;
    const resultado = r.resultadoCalculo as ResultadoCotacao | null;
    const financeiro = extrairResumoFinanceiro(resultado, markupPct);
    const params = r.params as Cotacao["params"];
    return {
      id: r.id,
      cliente: r.cliente,
      status: r.status,
      totalBRL: numOrNull(r.totalBRL),
      canalPredominante: r.canalPredominante,
      origem: r.origem,
      destino: r.destino,
      icmsSaidaPct: params.icmsSaida ?? null,
      markupPct,
      markupBRL: financeiro?.markupBRL ?? null,
      lucroLiquidoTradeBRL: financeiro?.lucroLiquidoTradeBRL ?? null,
      custoImportacaoBRL: financeiro?.custoImportacaoBRL ?? null,
      impostosSaidaBRL: financeiro?.impostosSaidaBRL ?? null,
      custoOperacionalBRL: financeiro?.custoImportacaoBRL ?? null,
      totalItens: r._count.itens,
      criadoEm: r.criadoEm.toISOString(),
    };
  });

  const comTotal = rows.filter((r) => numOrNull(r.totalBRL) != null && Number(r.totalBRL) > 0).length;

  return {
    totalCotacoes,
    cotacoesHoje,
    cotacoesSemana,
    cotacoesMes,
    volumeOrcadoBRL,
    lucroTradeTotalBRL,
    markupMedioPct: comMarkup > 0 ? somaMarkupPct / comMarkup : 0,
    ticketMedioBRL: comTotal > 0 ? volumeOrcadoBRL / comTotal : 0,
    porCanal,
    porDestino,
    recentes,
    amostra: rows.length,
  };
}
