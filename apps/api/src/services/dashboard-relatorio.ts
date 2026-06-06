/** Relatório de faturamento mensal e anual (para contador). */

import { prisma } from "@cia/db";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { PersistenciaIndisponivelError } from "./cotacoes-persist.js";

const TENANT_SLUG = "default";

const MESES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES_LONGO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

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
  return `${MESES_CURTO[Number(m) - 1]}/${y.slice(2)}`;
}

function labelMesLongo(mes: number, ano: number): string {
  return `${MESES_LONGO[mes - 1]} de ${ano}`;
}

function inicioMes(ano: number, mes: number): Date {
  return new Date(ano, mes - 1, 1, 0, 0, 0, 0);
}

function fimMes(ano: number, mes: number): Date {
  return new Date(ano, mes, 0, 23, 59, 59, 999);
}

export type RelatorioProcesso = {
  id: string;
  cliente: string;
  destino: string;
  criadoEm: string;
  totalBRL: number;
  lucroTradeBRL: number;
  lucroLiquidoBRL: number;
};

export type RelatorioMes = {
  mes: string;
  label: string;
  mesNum: number;
  processos: number;
  volumeBRL: number;
  lucroTradeBRL: number;
  lucroLiquidoBRL: number;
};

export type RelatorioFaturamento = {
  tipo: "mensal" | "anual";
  ano: number;
  mes?: number;
  periodoLabel: string;
  empresa: string;
  geradoEm: string;
  meses: RelatorioMes[];
  totais: {
    processos: number;
    volumeBRL: number;
    lucroTradeBRL: number;
    lucroLiquidoBRL: number;
    ticketMedioBRL: number;
  };
  processos: RelatorioProcesso[];
};

function agregarRow(
  r: {
    id: string;
    cliente: string;
    destino: string;
    criadoEm: Date;
    totalBRL: unknown;
    params: unknown;
    resultadoCalculo: unknown;
  },
  bucket: { processos: number; volumeBRL: number; lucroTradeBRL: number; lucroLiquidoBRL: number },
  detalhes: RelatorioProcesso[],
) {
  const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.06;
  const resultado = r.resultadoCalculo as ResultadoCotacao | null;
  const fin = extrairResumoFinanceiro(resultado, markupPct);
  const total = numOrNull(r.totalBRL) ?? 0;

  bucket.processos++;
  bucket.volumeBRL += total;
  if (fin) {
    bucket.lucroTradeBRL += fin.markupBRL;
    bucket.lucroLiquidoBRL += fin.lucroLiquidoTradeBRL;
  }

  detalhes.push({
    id: r.id,
    cliente: r.cliente,
    destino: r.destino,
    criadoEm: r.criadoEm.toISOString(),
    totalBRL: total,
    lucroTradeBRL: fin?.markupBRL ?? 0,
    lucroLiquidoBRL: fin?.lucroLiquidoTradeBRL ?? 0,
  });
}

export async function obterRelatorioFaturamento(opts: { ano: number; mes?: number }): Promise<RelatorioFaturamento> {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const ano = opts.ano;
  const mes = opts.mes;
  const tipo = mes != null ? "mensal" : "anual";

  if (ano < 2020 || ano > 2100) throw new Error("Ano inválido.");
  if (mes != null && (mes < 1 || mes > 12)) throw new Error("Mês inválido.");

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error('Tenant "default" não encontrado');

  const desde = mes != null ? inicioMes(ano, mes) : inicioMes(ano, 1);
  const ate = mes != null ? fimMes(ano, mes) : fimMes(ano, 12);

  const rows = await prisma.cotacao.findMany({
    where: { tenantId: tenant.id, criadoEm: { gte: desde, lte: ate } },
    orderBy: { criadoEm: "asc" },
    select: {
      id: true,
      cliente: true,
      destino: true,
      criadoEm: true,
      totalBRL: true,
      params: true,
      resultadoCalculo: true,
    },
  });

  const detalhes: RelatorioProcesso[] = [];
  const buckets = new Map<string, RelatorioMes>();

  if (tipo === "anual") {
    for (let m = 1; m <= 12; m++) {
      const chave = `${ano}-${String(m).padStart(2, "0")}`;
      buckets.set(chave, {
        mes: chave,
        label: labelMes(chave),
        mesNum: m,
        processos: 0,
        volumeBRL: 0,
        lucroTradeBRL: 0,
        lucroLiquidoBRL: 0,
      });
    }
  } else {
    const chave = `${ano}-${String(mes!).padStart(2, "0")}`;
    buckets.set(chave, {
      mes: chave,
      label: labelMes(chave),
      mesNum: mes!,
      processos: 0,
      volumeBRL: 0,
      lucroTradeBRL: 0,
      lucroLiquidoBRL: 0,
    });
  }

  for (const r of rows) {
    const chave = chaveMes(r.criadoEm);
    const bucket = buckets.get(chave);
    if (!bucket) continue;
    agregarRow(r, bucket, detalhes);
  }

  const meses = [...buckets.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  const totais = meses.reduce(
    (acc, m) => ({
      processos: acc.processos + m.processos,
      volumeBRL: acc.volumeBRL + m.volumeBRL,
      lucroTradeBRL: acc.lucroTradeBRL + m.lucroTradeBRL,
      lucroLiquidoBRL: acc.lucroLiquidoBRL + m.lucroLiquidoBRL,
      ticketMedioBRL: 0,
    }),
    { processos: 0, volumeBRL: 0, lucroTradeBRL: 0, lucroLiquidoBRL: 0, ticketMedioBRL: 0 },
  );
  totais.ticketMedioBRL = totais.processos > 0 ? totais.volumeBRL / totais.processos : 0;

  return {
    tipo,
    ano,
    mes,
    periodoLabel: mes != null ? labelMesLongo(mes, ano) : `Exercício ${ano}`,
    empresa: tenant.nome,
    geradoEm: new Date().toISOString(),
    meses,
    totais,
    processos: detalhes.sort((a, b) => b.criadoEm.localeCompare(a.criadoEm)),
  };
}
