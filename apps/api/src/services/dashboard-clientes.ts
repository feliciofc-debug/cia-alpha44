/** Ranking e busca de clientes (Fase 5a). */

import { prisma } from "@cia/db";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { PersistenciaIndisponivelError } from "./cotacoes-persist.js";
import { ensureTenant } from "../auth/tenant.js";

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

export async function listarClientesDashboard(tenantSlug: string, q?: string) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const tid = await ensureTenant(tenantSlug);

  const where: { tenantId: string; cliente?: { contains: string; mode: "insensitive" } } = {
    tenantId: tid,
  };
  if (q?.trim()) {
    where.cliente = { contains: q.trim(), mode: "insensitive" };
  }

  const rows = await prisma.cotacao.findMany({
    where,
    orderBy: { criadoEm: "desc" },
    take: 500,
  });

  const map = new Map<
    string,
    {
      cliente: string;
      processos: number;
      volumeBRL: number;
      lucroTradeBRL: number;
      somaMarkup: number;
      ultimaCotacaoId: string;
      ultimaCotacaoEm: string;
      destinos: Set<string>;
    }
  >();

  for (const r of rows) {
    const nome = r.cliente?.trim() || "Sem cliente";
    const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.06;
    const resultado = r.resultadoCalculo as ResultadoCotacao | null;
    const fin = extrairResumoFinanceiro(resultado, markupPct);
    const total = numOrNull(r.totalBRL) ?? 0;

    let entry = map.get(nome);
    if (!entry) {
      entry = {
        cliente: nome,
        processos: 0,
        volumeBRL: 0,
        lucroTradeBRL: 0,
        somaMarkup: 0,
        ultimaCotacaoId: r.id,
        ultimaCotacaoEm: r.criadoEm.toISOString(),
        destinos: new Set(),
      };
      map.set(nome, entry);
    }

    entry.processos++;
    entry.volumeBRL += total;
    if (fin) {
      entry.lucroTradeBRL += fin.markupBRL;
      entry.somaMarkup += fin.markupPct;
    }
    if (r.destino) entry.destinos.add(r.destino);
  }

  const clientes = [...map.values()]
    .map((c) => ({
      cliente: c.cliente,
      processos: c.processos,
      volumeBRL: c.volumeBRL,
      lucroTradeBRL: c.lucroTradeBRL,
      markupMedioPct: c.processos > 0 ? c.somaMarkup / c.processos : 0,
      ultimaCotacaoId: c.ultimaCotacaoId,
      ultimaCotacaoEm: c.ultimaCotacaoEm,
      destinos: [...c.destinos],
    }))
    .sort((a, b) => b.volumeBRL - a.volumeBRL);

  return { total: clientes.length, clientes };
}
