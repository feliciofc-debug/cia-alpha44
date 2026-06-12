/** Persistência de cotações — Prisma + mapeamento domínio ↔ banco. */

import { prisma, type CanalAduaneiro, type Cotacao as CotacaoRow } from "@cia/db";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import { extrairItemMeta, mesclarItemMeta } from "@cia/pipeline";
import {
  limparConfirmacaoNcm,
  metaConfirmacaoNcm,
  validarConfirmacaoNcmItem,
  validarConfirmacaoNcmItens,
  ncm8Limpo,
} from "@cia/shared";
import {
  aplicarPatchesAliquotasItem,
  icmsSaidaParaDestino,
  inferirQtdContainers,
  normalizarUf,
  type ChaveTributoRastro,
  type Cotacao,
  type Despesa,
  type Item,
  type ParamsSaida,
} from "@cia/shared";
import type { Prisma } from "@prisma/client";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { calcularCotacao } from "./cotacao.js";
import { excluirFotosCotacao, fotoUrlApi, lerFotoItem, salvarFotoItem } from "./fotos.js";
import type { AppState } from "../state.js";

const TENANT_SLUG = "default";

export class PersistenciaIndisponivelError extends Error {
  constructor() {
    super("Banco de dados indisponível — configure DATABASE_URL e rode db:migrate:deploy + db:seed.");
    this.name = "PersistenciaIndisponivelError";
  }
}

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function tenantId(): Promise<string> {
  const t = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!t) throw new Error('Tenant "default" não encontrado — rode: npm run db:seed -w @cia/db');
  return t.id;
}

function canalPredominante(itens: Item[]): CanalAduaneiro | null {
  const counts: Record<string, number> = {};
  for (const it of itens) {
    const c = it.risco?.canal ?? "AMARELO_TECNICO";
    counts[c] = (counts[c] ?? 0) + 1;
  }
  let best: CanalAduaneiro | null = null;
  let max = 0;
  for (const [c, n] of Object.entries(counts)) {
    if (n > max) {
      max = n;
      best = c as CanalAduaneiro;
    }
  }
  return best;
}

function inicioDoDia(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

type CotacaoComRelacoes = CotacaoRow & {
  itens: Array<{
    id: string;
    ordem: number;
    descOriginal: string;
    descPt: string;
    descDuimp: string;
    ncm: string;
    ncmCandidatos: unknown;
    pesoBrutoKg: Prisma.Decimal | null;
    pesoLiqKg: Prisma.Decimal;
    qtd: Prisma.Decimal | null;
    fobUnitarioUS: Prisma.Decimal | null;
    fobTotalUS: Prisma.Decimal;
    aliquotas: unknown;
    aliquotasOverride: boolean;
    benchmark: unknown;
    calibracao: unknown;
    risco: unknown;
    anuencia: unknown;
    antidumping: boolean;
    fotoPath?: string | null;
    meta?: unknown;
  }>;
  despesas: Array<{
    id: string;
    ordem: number;
    nome: string;
    valorBRL: Prisma.Decimal;
    entraBaseSaida: boolean;
    entraBaseNota: boolean;
  }>;
};

function num(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

function numOrNull(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v == null) return null;
  return typeof v === "number" ? v : Number(v);
}

export function mapRowParaDominio(row: CotacaoComRelacoes): {
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
} {
  const itens: Item[] = [...row.itens]
    .sort((a, b) => a.ordem - b.ordem)
    .map((it) =>
      mesclarItemMeta(
        {
          id: it.id,
          descOriginal: it.descOriginal,
          descPt: it.descPt,
          descDuimp: it.descDuimp,
          ncm: it.ncm,
          ncmCandidatos: (it.ncmCandidatos as Item["ncmCandidatos"]) ?? [],
          pesoBrutoKg: numOrNull(it.pesoBrutoKg),
          pesoLiqKg: num(it.pesoLiqKg),
          qtd: numOrNull(it.qtd),
          fobUnitarioUS: numOrNull(it.fobUnitarioUS),
          fobTotalUS: num(it.fobTotalUS),
          aliquotas: it.aliquotas as Item["aliquotas"],
          aliquotasOverride: it.aliquotasOverride,
          benchmark: (it.benchmark as Item["benchmark"]) ?? undefined,
          calibracao: (it.calibracao as Item["calibracao"]) ?? undefined,
          risco: (it.risco as Item["risco"]) ?? undefined,
          anuencia: (it.anuencia as string[]) ?? [],
          antidumping: it.antidumping,
          ...(it.fotoPath
            ? { fotoPath: it.fotoPath, fotoUrl: fotoUrlApi(row.id, it.ordem) }
            : {}),
        },
        it.meta,
      ),
    )
    .map(validarConfirmacaoNcmItem);

  const despesas = [...row.despesas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((d) => ({
      nome: d.nome,
      valorBRL: num(d.valorBRL),
      entraBaseSaida: d.entraBaseSaida,
      entraBaseNota: d.entraBaseNota,
    }));

  const params = row.params as Cotacao["params"];

  const cotacao: Cotacao = {
    id: row.id,
    empresaTrade: row.empresaTrade ?? "",
    cliente: row.cliente,
    benefFiscal: row.benefFiscal as Cotacao["benefFiscal"],
    moeda: row.moeda,
    cambio: num(row.cambio),
    freteTotalUS: num(row.freteTotalUS),
    adicionaisVaUS: num(row.adicionaisVaUS),
    reducaoBaseUS: num(row.reducaoBaseUS),
    siscomex: num(row.siscomex),
    antidumpingBRL: num(row.antidumpingBRL),
    incoterm: row.incoterm,
    origem: row.origem,
    destino: row.destino,
    itens,
    despesas,
    qtdContainers: inferirQtdContainers(despesas),
    outrasDespesasBaseBRL: numOrNull(row.outrasDespesasBaseBRL) ?? undefined,
    params,
    criadoEm: row.criadoEm.toISOString(),
  };

  return {
    cotacao,
    itens,
    resultado: (row.resultadoCalculo as ResultadoCotacao | null) ?? null,
  };
}

export interface SalvarCotacaoInput {
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
  provider?: string;
}

export async function salvarCotacao(input: SalvarCotacaoInput) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const { cotacao, itens, resultado } = input;
  const tid = await tenantId();
  const canal = canalPredominante(itens);

  const row = await prisma.cotacao.create({
    data: {
      tenantId: tid,
      empresaTrade: cotacao.empresaTrade?.trim() || "",
      cliente: cotacao.cliente?.trim() || "Sem cliente",
      benefFiscal: cotacao.benefFiscal,
      moeda: cotacao.moeda,
      cambio: cotacao.cambio,
      freteTotalUS: cotacao.freteTotalUS,
      adicionaisVaUS: cotacao.adicionaisVaUS,
      reducaoBaseUS: cotacao.reducaoBaseUS,
      siscomex: cotacao.siscomex,
      antidumpingBRL: cotacao.antidumpingBRL,
      incoterm: cotacao.incoterm,
      origem: cotacao.origem,
      destino: cotacao.destino,
      outrasDespesasBaseBRL: cotacao.outrasDespesasBaseBRL ?? null,
      params: cotacao.params,
      status: resultado ? "CALCULADA" : "RASCUNHO",
      totalBRL: resultado?.totalBRL ?? null,
      totalUS: resultado?.totalUS ?? null,
      canalPredominante: canal,
      resultadoCalculo: (resultado ?? undefined) as Prisma.InputJsonValue | undefined,
      calculadoEm: resultado ? new Date() : null,
      itens: {
        create: itens.map((it, ordem) => ({
          ordem,
          descOriginal: it.descOriginal,
          descPt: it.descPt ?? "",
          descDuimp: it.descDuimp ?? "",
          ncm: it.ncm || "00000000",
          ncmCandidatos: it.ncmCandidatos ?? [],
          pesoBrutoKg: it.pesoBrutoKg,
          pesoLiqKg: it.pesoLiqKg ?? 0,
          qtd: it.qtd,
          fobUnitarioUS: it.fobUnitarioUS,
          fobTotalUS: it.fobTotalUS ?? 0,
          aliquotas: it.aliquotas,
          aliquotasOverride: it.aliquotasOverride ?? false,
          benchmark: it.benchmark ?? undefined,
          calibracao: it.calibracao ?? undefined,
          risco: it.risco ?? undefined,
          anuencia: it.anuencia ?? [],
          antidumping: it.antidumping ?? false,
          meta: extrairItemMeta(it) as Prisma.InputJsonValue,
        })),
      },
      despesas: {
        create: (cotacao.despesas ?? []).map((d, ordem) => ({
          ordem,
          nome: d.nome,
          valorBRL: d.valorBRL,
          entraBaseSaida: d.entraBaseSaida,
          entraBaseNota: d.entraBaseNota,
        })),
      },
    },
    include: { itens: true, despesas: true },
  });

  for (const [ordem, it] of itens.entries()) {
    const itemRow = row.itens.find((i) => i.ordem === ordem);
    if (!itemRow) continue;

    let fotoPath: string | null = null;
    if (it.fotoBase64) {
      fotoPath = await salvarFotoItem(row.id, ordem, it.fotoBase64, it.fotoMime ?? "image/jpeg");
    } else if (it.fotoPath) {
      const existente = await lerFotoItem(it.fotoPath);
      if (existente) {
        fotoPath = await salvarFotoItem(
          row.id,
          ordem,
          existente.buffer.toString("base64"),
          existente.mime,
        );
      }
    }

    if (fotoPath) {
      await prisma.item.update({ where: { id: itemRow.id }, data: { fotoPath } });
      itemRow.fotoPath = fotoPath;
    }
  }

  return formatCotacaoSalva(row as CotacaoComRelacoes, input.provider);
}

function formatCotacaoSalva(row: CotacaoComRelacoes, provider?: string) {
  const { cotacao, itens, resultado } = mapRowParaDominio(row);
  const financeiro = extrairResumoFinanceiro(resultado, cotacao.params.markupPct);
  return {
    id: row.id,
    status: row.status,
    criadoEm: row.criadoEm.toISOString(),
    calculadoEm: row.calculadoEm?.toISOString() ?? null,
    canalPredominante: row.canalPredominante,
    totalBRL: numOrNull(row.totalBRL),
    financeiro,
    provider: provider ?? null,
    cotacao,
    itens,
    resultado,
    avisoFiscal: resultado ? null : "Cotação salva sem totais fiscais.",
  };
}

export async function listarCotacoes(opts?: { cliente?: string; limite?: number }) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const tid = await tenantId();
  const limite = opts?.limite ?? 100;
  const where: Prisma.CotacaoWhereInput = { tenantId: tid };
  if (opts?.cliente?.trim()) {
    where.cliente = { contains: opts.cliente.trim(), mode: "insensitive" };
  }

  const [rows, totalHoje] = await Promise.all([
    prisma.cotacao.findMany({
      where,
      orderBy: { criadoEm: "desc" },
      take: limite,
      include: { _count: { select: { itens: true } } },
    }),
    prisma.cotacao.count({
      where: { tenantId: tid, criadoEm: { gte: inicioDoDia() } },
    }),
  ]);

  return {
    totalHoje,
    cotacoes: rows.map((r) => {
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
    }),
  };
}

export async function buscarCotacao(id: string) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await prisma.cotacao.findUnique({
    where: { id },
    include: { itens: true, despesas: true },
  });
  if (!row) return null;
  return formatCotacaoSalva(row as CotacaoComRelacoes);
}

export async function duplicarCotacao(
  id: string,
  state: AppState,
  opts?: { markupPct?: number; cliente?: string },
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const orig = await prisma.cotacao.findUnique({
    where: { id },
    include: { itens: true, despesas: true },
  });
  if (!orig) return null;

  const { cotacao } = mapRowParaDominio(orig);
  const params = { ...cotacao.params };
  if (opts?.markupPct != null) params.markupPct = opts.markupPct;

  const nova: Cotacao = {
    ...cotacao,
    id: undefined,
    cliente: opts?.cliente?.trim() || `${cotacao.cliente} (cópia)`,
    params,
    itens: cotacao.itens.map((it) => ({ ...it, id: undefined })),
  };

  const destino = normalizarUf(nova.destino) ?? "SP";
  nova.destino = destino;
  nova.params = {
    ...params,
    icmsSaida: icmsSaidaParaDestino(destino, nova.benefFiscal),
  };

  const { resultado, itens } = calcularCotacao(nova, state);
  return salvarCotacao({ cotacao: nova, itens, resultado });
}

export interface AtualizarCotacaoInput {
  origem?: string;
  destino?: string;
  benefFiscal?: Cotacao["benefFiscal"];
  empresaTrade?: string;
  cliente?: string;
  cambio?: number;
  freteTotalUS?: number;
  siscomex?: number;
  adicionaisVaUS?: number;
  reducaoBaseUS?: number;
  markupPct?: number;
  qtdContainers?: number;
  outrasDespesasBaseBRL?: number;
  despesas?: Despesa[];
  params?: Partial<ParamsSaida>;
  /** Se true, recalcula icmsSaida a partir de destino+benefício (ignora override manual). */
  icmsAuto?: boolean;
  /** Override de alíquotas de importação por item (ordem = índice na cotação). */
  itensAliquotas?: Array<{
    ordem: number;
    aliquotas?: Item["aliquotas"];
    aliquotasOverride?: boolean;
    desfazerTributos?: ChaveTributoRastro[];
  }>;
}

function mergeParams(
  base: ParamsSaida,
  destino: string,
  benefFiscal: string,
  opts: AtualizarCotacaoInput,
): ParamsSaida {
  const params = { ...base, ...opts.params };
  if (opts.markupPct != null) params.markupPct = opts.markupPct;
  if (opts.icmsAuto !== false && opts.params?.icmsSaida == null) {
    params.icmsSaida = icmsSaidaParaDestino(destino, benefFiscal);
  }
  return params;
}

export async function atualizarCotacao(id: string, state: AppState, opts: AtualizarCotacaoInput) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await prisma.cotacao.findUnique({
    where: { id },
    include: { itens: true, despesas: true },
  });
  if (!row) return null;

  const { cotacao, itens: itensAtuais } = mapRowParaDominio(row);
  const itensDom =
    opts.itensAliquotas?.length
      ? itensAtuais.map((it, ordem) => {
          const patch = opts.itensAliquotas!.find((p) => p.ordem === ordem);
          if (!patch) return it;
          return aplicarPatchesAliquotasItem(it, {
            aliquotas: patch.aliquotas,
            aliquotasOverride: patch.aliquotasOverride,
            desfazerTributos: patch.desfazerTributos,
          });
        })
      : itensAtuais;

  const origem = opts.origem ? (normalizarUf(opts.origem) ?? cotacao.origem) : cotacao.origem;
  const destino = opts.destino ? (normalizarUf(opts.destino) ?? cotacao.destino) : cotacao.destino;
  const benefFiscal = opts.benefFiscal ?? cotacao.benefFiscal;
  const empresaTrade = opts.empresaTrade !== undefined ? opts.empresaTrade.trim() : cotacao.empresaTrade;
  const cliente = opts.cliente !== undefined ? opts.cliente.trim() || "Sem cliente" : cotacao.cliente;
  const despesas = opts.despesas ?? cotacao.despesas;
  const outrasDespesasBaseBRL = opts.outrasDespesasBaseBRL ?? cotacao.outrasDespesasBaseBRL;
  const params = mergeParams(cotacao.params, destino, benefFiscal, opts);

  const atualizada: Cotacao = {
    ...cotacao,
    origem,
    destino,
    benefFiscal,
    empresaTrade,
    cliente,
    despesas,
    outrasDespesasBaseBRL,
    ...(opts.cambio != null ? { cambio: opts.cambio } : {}),
    ...(opts.freteTotalUS != null ? { freteTotalUS: opts.freteTotalUS } : {}),
    ...(opts.siscomex != null ? { siscomex: opts.siscomex } : {}),
    ...(opts.adicionaisVaUS != null ? { adicionaisVaUS: opts.adicionaisVaUS } : {}),
    ...(opts.reducaoBaseUS != null ? { reducaoBaseUS: opts.reducaoBaseUS } : {}),
    ...(opts.qtdContainers != null ? { qtdContainers: opts.qtdContainers } : {}),
    params,
    itens: itensDom,
  };
  const { resultado, itens } = calcularCotacao(atualizada, state);
  const itensValidados = validarConfirmacaoNcmItens(itens);
  const canal = canalPredominante(itensValidados);

  const updated = await prisma.$transaction(async (tx) => {
    if (opts.despesas) {
      await tx.despesa.deleteMany({ where: { cotacaoId: id } });
    }
    if (opts.itensAliquotas?.length) {
      for (const patch of opts.itensAliquotas) {
        const itemRow = row.itens.find((i) => i.ordem === patch.ordem);
        const patchedItem = itensValidados[patch.ordem];
        if (!itemRow || !patchedItem) continue;
        const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
        const metaNovo = {
          ...metaAtual,
          ...extrairItemMeta(patchedItem),
        };
        await tx.item.update({
          where: { id: itemRow.id },
          data: {
            aliquotas: patchedItem.aliquotas as Prisma.InputJsonValue,
            aliquotasOverride: patchedItem.aliquotasOverride ?? false,
            meta: metaNovo as Prisma.InputJsonValue,
          },
        });
      }
    }
    return tx.cotacao.update({
      where: { id },
      data: {
        origem,
        destino,
        benefFiscal,
        empresaTrade,
        cliente,
        params,
        ...(opts.cambio != null ? { cambio: opts.cambio } : {}),
        ...(opts.freteTotalUS != null ? { freteTotalUS: opts.freteTotalUS } : {}),
        ...(opts.siscomex != null ? { siscomex: opts.siscomex } : {}),
        ...(opts.adicionaisVaUS != null ? { adicionaisVaUS: opts.adicionaisVaUS } : {}),
        ...(opts.reducaoBaseUS != null ? { reducaoBaseUS: opts.reducaoBaseUS } : {}),
        status: resultado ? "CALCULADA" : row.status,
        totalBRL: resultado?.totalBRL ?? null,
        totalUS: resultado?.totalUS ?? null,
        canalPredominante: canal,
        resultadoCalculo: (resultado ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        calculadoEm: resultado ? new Date() : row.calculadoEm,
        ...(opts.despesas
          ? {
              despesas: {
                create: despesas.map((d, ordem) => ({
                  ordem,
                  nome: d.nome,
                  valorBRL: d.valorBRL,
                  entraBaseSaida: d.entraBaseSaida,
                  entraBaseNota: d.entraBaseNota,
                })),
              },
            }
          : {}),
      },
      include: { itens: true, despesas: true },
    });
  });

  return formatCotacaoSalva(updated as CotacaoComRelacoes);
}

/** @deprecated use atualizarCotacao */
export async function atualizarFiscalCotacao(id: string, state: AppState, opts: AtualizarCotacaoInput) {
  return atualizarCotacao(id, state, opts);
}

/** Marca item com revisão humana do NCM (persiste em Item.meta). */
export async function confirmarNcmItem(cotacaoId: string, ordem: number, confirmadoPor?: string, provider?: string) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!row) return null;

  const itemRow = row.itens.find((i) => i.ordem === ordem);
  if (!itemRow) return null;

  const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
  const base = mesclarItemMeta(
    {
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: num(itemRow.pesoLiqKg),
      fobTotalUS: num(itemRow.fobTotalUS),
    } as Item,
    metaAtual,
  );
  const novoMeta = extrairItemMeta({
    ...base,
    ...metaConfirmacaoNcm(itemRow.ncm, confirmadoPor),
  });

  await prisma.item.update({
    where: { id: itemRow.id },
    data: { meta: novoMeta as Prisma.InputJsonValue },
  });

  const atualizada = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!atualizada) return null;
  return formatCotacaoSalva(atualizada as CotacaoComRelacoes, provider);
}

/** Remove revisão humana do NCM (item volta a bloquear PDF). */
export async function desfazerConfirmacaoNcmItem(cotacaoId: string, ordem: number, provider?: string) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!row) return null;

  const itemRow = row.itens.find((i) => i.ordem === ordem);
  if (!itemRow) return null;

  const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
  const base = mesclarItemMeta(
    {
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: num(itemRow.pesoLiqKg),
      fobTotalUS: num(itemRow.fobTotalUS),
    } as Item,
    metaAtual,
  );
  const novoMeta = extrairItemMeta(limparConfirmacaoNcm(base));

  await prisma.item.update({
    where: { id: itemRow.id },
    data: { meta: novoMeta as Prisma.InputJsonValue },
  });

  const atualizada = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!atualizada) return null;
  return formatCotacaoSalva(atualizada as CotacaoComRelacoes, provider);
}

/** Altera NCM do item salvo, limpa confirmação humana e recalcula a cotação. */
export async function alterarNcmItem(cotacaoId: string, ordem: number, ncmNovo: string, state: AppState) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const ncm = ncm8Limpo(ncmNovo);
  if (!ncm || ncm === "00000000") throw new Error("NCM inválido (8 dígitos).");

  const row = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!row) return null;

  const itemRow = row.itens.find((i) => i.ordem === ordem);
  if (!itemRow) return null;

  const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
  const base = mesclarItemMeta(
    {
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: itemRow.ncm,
      pesoLiqKg: num(itemRow.pesoLiqKg),
      fobTotalUS: num(itemRow.fobTotalUS),
    } as Item,
    metaAtual,
  );
  const novoMeta = extrairItemMeta(limparConfirmacaoNcm({ ...base, ncm }));

  await prisma.item.update({
    where: { id: itemRow.id },
    data: { ncm, meta: novoMeta as Prisma.InputJsonValue },
  });

  const refreshed = await prisma.cotacao.findUnique({
    where: { id: cotacaoId },
    include: { itens: true, despesas: true },
  });
  if (!refreshed) return null;

  const { cotacao } = mapRowParaDominio(refreshed);
  const { resultado, itens } = calcularCotacao(cotacao, state);
  const itensValidados = validarConfirmacaoNcmItens(itens);
  const canal = canalPredominante(itensValidados);

  await prisma.cotacao.update({
    where: { id: cotacaoId },
    data: {
      status: resultado ? "CALCULADA" : row.status,
      totalBRL: resultado?.totalBRL ?? null,
      totalUS: resultado?.totalUS ?? null,
      canalPredominante: canal,
      resultadoCalculo: (resultado ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
      calculadoEm: resultado ? new Date() : row.calculadoEm,
    },
  });

  const salva = formatCotacaoSalva(refreshed as CotacaoComRelacoes);
  return {
    ...salva,
    id: cotacaoId,
    itens: itensValidados,
    resultado,
    criadoEm: refreshed.criadoEm.toISOString(),
  };
}

export async function excluirCotacao(id: string): Promise<boolean> {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await prisma.cotacao.findUnique({ where: { id }, select: { id: true } });
  if (!row) return false;

  await prisma.cotacao.delete({ where: { id } });
  await excluirFotosCotacao(id);
  return true;
}
