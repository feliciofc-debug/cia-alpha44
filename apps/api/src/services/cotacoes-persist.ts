/** Persistência de cotações — Prisma + mapeamento domínio ↔ banco. */

import { prisma, type CanalAduaneiro, type Cotacao as CotacaoRow } from "@cia/db";
import type { ItemFiscalResult, ResultadoCotacao } from "@cia/fiscal-engine";
import {
  extrairItemMeta,
  limparNcmInjetadoMeta,
  mesclarItemMeta,
  ncmColunaEmbarqueParaClassificacao,
  criarPdfNcmAuditCtx,
  enriquecerItensPdfNcmAudit,
  analisarEscalaFobItem,
  bloquearPersistenciaFobCorrupto,
  type NcmCatalog,
  type LinhaCrua,
  type ItemMetaPersistido,
  type LimpezaNcmInjetadoMotivo,
} from "@cia/pipeline";
import {
  confirmacaoNcmVigente,
  itensResolucaoNcm,
  limparConfirmacaoNcm,
  metaConfirmacaoNcm,
  ncmInformadoParaFechamento,
  normalizarAceiteNcmInformado,
  validarConfirmacaoNcmItem,
  validarConfirmacaoNcmItens,
  ncm8Limpo,
  mesclarAvisoMoedaCotacao,
  mesclarOrdemItensPersistidos,
} from "@cia/shared";
import {
  aplicarIcmsCotacao,
  aplicarPatchesAliquotasItem,
  defaultsIcmsPersistencia,
  inferirQtdContainers,
  normalizarUf,
  type ChaveTributoRastro,
  type Cotacao,
  type Despesa,
  type Item,
  type ParamsSaida,
  type RegimeIcmsPersistido,
  type AvisoValoracao,
} from "@cia/shared";
import type { Prisma } from "@prisma/client";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { calcularCotacao, fobKgFinalItem, montarItens, type ResultadoCompleto } from "./cotacao.js";
import { calcAvisoValoracaoFobKg } from "./fob-kg-manual.js";
import { detectarFamilia } from "@cia/pipeline";
import type { AppState } from "../state.js";
import {
  outputConfirmacaoHumana,
  salvarClassificacaoCacheHumano,
  versoesClassificacaoCacheAtual,
} from "./classificacao-cache.js";
import { excluirFotosCotacao, fotoUrlApi, lerFotoItem, salvarFotoItem } from "./fotos.js";
import { ensureTenant } from "../auth/tenant.js";

const COT72_PRODUCAO_ID = "cmqlfuhvm000ykw2cue1whldj";
const COT72_MARKUP_REGRA_ATUAL = 0.04;

export class PersistenciaIndisponivelError extends Error {
  constructor() {
    super("Banco de dados indisponível — configure DATABASE_URL e rode db:migrate:deploy + db:seed.");
    this.name = "PersistenciaIndisponivelError";
  }
}

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

async function tidFromSlug(tenantSlug: string): Promise<string> {
  return ensureTenant(tenantSlug);
}

async function buscarCotacaoRow(id: string, tenantSlug: string) {
  const tid = await tidFromSlug(tenantSlug);
  return prisma.cotacao.findFirst({
    where: { id, tenantId: tid },
    include: { itens: true, despesas: true },
  });
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
    fobKgManual: Prisma.Decimal | null;
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

function parseAvisosFiscais(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((a): a is string => typeof a === "string");
}

function regimePersistido(raw: string | null | undefined): RegimeIcmsPersistido {
  return raw === "NORMAL" ? "NORMAL" : "AL_DIFERIDO";
}

function icmsPersistData(cotacao: Cotacao) {
  const d = defaultsIcmsPersistencia();
  return {
    ufEmpresa: cotacao.ufEmpresa ?? d.ufEmpresa,
    regimeIcms: cotacao.regimeIcms ?? d.regimeIcms,
    icmsSaidaManualFlag: cotacao.icmsSaidaManualFlag ?? d.icmsSaidaManualFlag,
    avisosFiscais: cotacao.avisosFiscais ?? d.avisosFiscais,
  };
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
          ordem: it.ordem,
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
          fobKgManual: numOrNull(it.fobKgManual),
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
    .map(validarConfirmacaoNcmItem)
    .map(normalizarAceiteNcmInformado);

  const despesas = [...row.despesas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((d) => ({
      nome: d.nome,
      valorBRL: num(d.valorBRL),
      entraBaseSaida: d.entraBaseSaida,
      entraBaseNota: d.entraBaseNota,
    }));

  const params = row.params as Cotacao["params"];

  const cotacao: Cotacao = mesclarAvisoMoedaCotacao({
    id: row.id,
    empresaTrade: row.empresaTrade ?? "",
    cliente: row.cliente,
    benefFiscal: row.benefFiscal as Cotacao["benefFiscal"],
    moeda: row.moeda,
    moedaPlanilha: row.moedaPlanilha ?? undefined,
    cambioEurUsd: numOrNull(row.cambioEurUsd) ?? undefined,
    cambioEurUsdData: row.cambioEurUsdData ?? undefined,
    cambioEurUsdFonte: row.cambioEurUsdFonte ?? undefined,
    cambio: num(row.cambio),
    freteTotalUS: num(row.freteTotalUS),
    adicionaisVaUS: num(row.adicionaisVaUS),
    reducaoBaseUS: num(row.reducaoBaseUS),
    siscomex: num(row.siscomex),
    antidumpingBRL: num(row.antidumpingBRL),
    incoterm: row.incoterm,
    origem: row.origem,
    destino: row.destino,
    ufEmpresa: row.ufEmpresa ?? "AL",
    regimeIcms: regimePersistido(row.regimeIcms),
    icmsSaidaManualFlag: row.icmsSaidaManualFlag ?? false,
    avisosFiscais: parseAvisosFiscais(row.avisosFiscais),
    itens,
    despesas,
    qtdContainers: inferirQtdContainers(despesas),
    outrasDespesasBaseBRL: numOrNull(row.outrasDespesasBaseBRL) ?? undefined,
    params,
    criadoEm: row.criadoEm.toISOString(),
  });

  return {
    cotacao,
    itens,
    resultado: (row.resultadoCalculo as ResultadoCotacao | null) ?? null,
  };
}

export interface SalvarCotacaoInput {
  tenantSlug: string;
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
  provider?: string;
}

export async function salvarCotacao(input: SalvarCotacaoInput) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const cotacao = mesclarAvisoMoedaCotacao(input.cotacao);
  const { itens, resultado } = input;
  const tid = await tidFromSlug(input.tenantSlug);
  const canal = canalPredominante(itens);

  const row = await prisma.cotacao.create({
    data: {
      tenantId: tid,
      empresaTrade: cotacao.empresaTrade?.trim() || "",
      cliente: cotacao.cliente?.trim() || "Sem cliente",
      benefFiscal: cotacao.benefFiscal,
      moeda: cotacao.moeda,
      moedaPlanilha: cotacao.moedaPlanilha ?? null,
      cambioEurUsd: cotacao.cambioEurUsd ?? null,
      cambioEurUsdData: cotacao.cambioEurUsdData ?? null,
      cambioEurUsdFonte: cotacao.cambioEurUsdFonte ?? null,
      cambio: cotacao.cambio,
      freteTotalUS: cotacao.freteTotalUS,
      adicionaisVaUS: cotacao.adicionaisVaUS,
      reducaoBaseUS: cotacao.reducaoBaseUS,
      siscomex: cotacao.siscomex,
      antidumpingBRL: cotacao.antidumpingBRL,
      incoterm: cotacao.incoterm,
      origem: cotacao.origem,
      destino: cotacao.destino,
      ...icmsPersistData(cotacao),
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
          fobKgManual: it.fobKgManual ?? null,
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

function formatCotacaoSalva(row: CotacaoComRelacoes, provider?: string, catalog?: NcmCatalog) {
  const { cotacao, itens: itensBase, resultado } = mapRowParaDominio(row);
  const itens = catalog ? enriquecerItensPdfNcmAudit(itensBase, criarPdfNcmAuditCtx(catalog)) : itensBase;
  const financeiro = extrairResumoFinanceiro(resultado, cotacao.params.markupPct);
  const icms = aplicarIcmsCotacao(cotacao).meta;
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
    icms,
    avisoFiscal: resultado ? null : "Cotação salva sem totais fiscais.",
    avisosFiscais: cotacao.avisosFiscais,
  };
}

type CotacaoSalvaFormatada = ReturnType<typeof formatCotacaoSalva>;

function montarRespostaCotacaoCalc(
  row: CotacaoComRelacoes,
  calc: ResultadoCompleto,
  catalog?: NcmCatalog,
  provider?: string,
): CotacaoSalvaFormatada {
  const base = formatCotacaoSalva(row, provider, catalog);
  const itensFinal = catalog
    ? enriquecerItensPdfNcmAudit(calc.itens, criarPdfNcmAuditCtx(catalog))
    : calc.itens;
  return {
    ...base,
    cotacao: { ...base.cotacao, params: calc.params, itens: itensFinal },
    itens: itensFinal,
    resultado: calc.resultado,
    icms: calc.icms,
    financeiro: extrairResumoFinanceiro(calc.resultado, calc.params.markupPct),
    calculadoEm: calc.resultado ? new Date().toISOString() : base.calculadoEm,
  };
}

/** Recalcula com planilha China vigente — usado ao abrir cotação, PDF e exportação. */
export function cotacaoRecalculadaFromRow(
  row: CotacaoComRelacoes,
  state: AppState,
  provider?: string,
): CotacaoSalvaFormatada {
  const { cotacao, itens: itensDb } = mapRowParaDominio(row);
  const calc = calcularCotacao(cotacao, state);
  const itensValidados = validarConfirmacaoNcmItens(mesclarOrdemItensPersistidos(calc.itens, itensDb));
  return montarRespostaCotacaoCalc(row, { ...calc, itens: itensValidados }, state.ncmCatalog, provider);
}

type ItemRowPersist = CotacaoComRelacoes["itens"][number];

function fiscalPorIndice(resultado: ResultadoCotacao | null | undefined, indice: number): ItemFiscalResult | null {
  return resultado?.itens?.[indice] ?? null;
}

function resumoItemReclassificacao(item: Item, fiscal: ItemFiscalResult | null) {
  return {
    ncm: item.ncm,
    ncmFonte: item.ncmFonte ?? null,
    descPt: item.descPt ?? "",
    fobTotalUS: item.fobTotalUS ?? 0,
    aliquotas: item.aliquotas,
    impostosEntrada: {
      ii: fiscal?.ii ?? null,
      ipi: fiscal?.ipi ?? null,
      pis: fiscal?.pis ?? null,
      cofins: fiscal?.cofins ?? null,
    },
    compatibilidadeProduto: item.compatibilidadeProduto ?? null,
    ncmAvisos: item.ncmAvisos ?? [],
  };
}

function camposAlteradosReclassificacao(
  antes: ReturnType<typeof resumoItemReclassificacao>,
  depois: ReturnType<typeof resumoItemReclassificacao>,
) {
  return {
    ncm: antes.ncm !== depois.ncm,
    ncmFonte: antes.ncmFonte !== depois.ncmFonte,
    descPt: antes.descPt !== depois.descPt,
    fobTotalUS: Math.abs((antes.fobTotalUS ?? 0) - (depois.fobTotalUS ?? 0)) > 0.005,
    ii: Math.abs((antes.impostosEntrada.ii ?? 0) - (depois.impostosEntrada.ii ?? 0)) > 0.005,
    ipi: Math.abs((antes.impostosEntrada.ipi ?? 0) - (depois.impostosEntrada.ipi ?? 0)) > 0.005,
    pis: Math.abs((antes.impostosEntrada.pis ?? 0) - (depois.impostosEntrada.pis ?? 0)) > 0.005,
    cofins: Math.abs((antes.impostosEntrada.cofins ?? 0) - (depois.impostosEntrada.cofins ?? 0)) > 0.005,
  };
}

function cotacaoSemColunaNcmReal(row: Pick<CotacaoComRelacoes, "id">): boolean {
  return row.id === COT72_PRODUCAO_ID;
}

function normalizarCotacaoLegadaCot72(cotacao: Cotacao, cotacaoId: string): Cotacao {
  if (cotacaoId !== COT72_PRODUCAO_ID) return cotacao;
  return {
    ...cotacao,
    params: {
      ...cotacao.params,
      markupPct: COT72_MARKUP_REGRA_ATUAL,
    },
  };
}

function rowComLimpezaNcmInjetado(row: CotacaoComRelacoes): {
  row: CotacaoComRelacoes;
  limpezas: Array<{
    ordem: number;
    motivo?: LimpezaNcmInjetadoMotivo;
    ncmPlanilhaOriginal?: string | null;
    ncmEmbarque?: string | null;
    ncmEmbarqueStatus?: string | null;
    ncmReferencia?: string | null;
  }>;
} {
  const limpezas: Array<{
    ordem: number;
    motivo?: LimpezaNcmInjetadoMotivo;
    ncmPlanilhaOriginal?: string | null;
    ncmEmbarque?: string | null;
    ncmEmbarqueStatus?: string | null;
    ncmReferencia?: string | null;
  }> = [];
  const forcarSemColunaNcm = cotacaoSemColunaNcmReal(row);
  const itens = row.itens.map((it) => {
    const antes = (it.meta as ItemMetaPersistido | null) ?? {};
    const { meta, limpo, motivo } = limparNcmInjetadoMeta(antes, { forcarSemColunaNcm });
    if (limpo) {
      limpezas.push({
        ordem: it.ordem,
        motivo,
        ncmPlanilhaOriginal: antes.ncmPlanilhaOriginal ?? null,
        ncmEmbarque: antes.ncmEmbarque ?? null,
        ncmEmbarqueStatus: antes.ncmEmbarqueStatus ?? null,
        ncmReferencia: meta.ncmReferencia ?? null,
      });
    }
    return limpo ? { ...it, meta } : it;
  });
  return { row: { ...row, itens }, limpezas };
}

async function persistirItensPosCalculo(
  itemRows: ItemRowPersist[],
  itensCalc: Item[],
  tx: Prisma.TransactionClient,
) {
  for (const it of itensCalc) {
    const ordem = it.ordem ?? -1;
    const itemRow = itemRows.find((r) => r.ordem === ordem);
    if (!itemRow) continue;
    const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
    const analise = analisarEscalaFobItem(it, it.benchmark);
    const fobPersistir = bloquearPersistenciaFobCorrupto(analise)
      ? Number(itemRow.fobTotalUS)
      : (it.fobTotalUS ?? 0);
    const avisosEscala =
      analise.flags.length > 0
        ? [`[FOB escala] ${analise.flags.join(", ")} ratio=${analise.ratio?.toFixed(1) ?? "—"}`]
        : [];
    const metaNovo = {
      ...metaAtual,
      ...extrairItemMeta(it),
      fobKgAvisos: [...(it.fobKgAvisos ?? []), ...avisosEscala].filter(Boolean).length
        ? [...(it.fobKgAvisos ?? []), ...avisosEscala]
        : it.fobKgAvisos,
    };
    await tx.item.update({
      where: { id: itemRow.id },
      data: {
        fobTotalUS: fobPersistir,
        fobUnitarioUS: it.fobUnitarioUS ?? null,
        benchmark: (it.benchmark ?? undefined) as Prisma.InputJsonValue | undefined,
        calibracao: (it.calibracao ?? undefined) as Prisma.InputJsonValue | undefined,
        risco: (it.risco ?? undefined) as Prisma.InputJsonValue | undefined,
        meta: metaNovo as Prisma.InputJsonValue,
      },
    });
  }
}

type LinhaCruaReclassificar = LinhaCrua & {
  ncmRevisadoHumano?: boolean;
  ncmConfirmado?: string | null;
  descPt?: string | null;
  descDuimp?: string | null;
};

/** Reconstrói linhas do upload a partir dos itens salvos — NCM da planilha cliente, não do classificador tóxico. */
function linhasCruasFromItensPersistidos(itens: ItemRowPersist[]): LinhaCruaReclassificar[] {
  return [...itens]
    .sort((a, b) => a.ordem - b.ordem)
    .map((it) => {
      const meta = (it.meta as ItemMetaPersistido | null) ?? {};
      const dominio = itemDominioFromRow(it);
      const humano = confirmacaoNcmVigente(dominio);
      const linha: LinhaCruaReclassificar = {
        descOriginal: it.descOriginal,
        material: meta.material ?? null,
        uso: meta.uso ?? null,
        ncm: ncmColunaEmbarqueParaClassificacao(meta, {
          ncmConfirmadoHumano: humano ? it.ncm : null,
        }),
        pesoBrutoKg: numOrNull(it.pesoBrutoKg),
        pesoLiqKg: num(it.pesoLiqKg),
        qtd: numOrNull(it.qtd),
        fobUnitarioUS: numOrNull(it.fobUnitarioUS),
        // Não reutilizar meta.fobEmbarqueUS — pode estar corrompido de classificação antiga.
        fobTotalUS: null,
      };
      if (humano) {
        linha.ncmRevisadoHumano = true;
        linha.ncmConfirmado = it.ncm;
        linha.descPt = it.descPt;
        linha.descDuimp = it.descDuimp;
      }
      return linha;
    });
}

async function persistirItensPosReclassificacao(
  itemRows: ItemRowPersist[],
  itensCalc: Item[],
  tx: Prisma.TransactionClient,
) {
  for (const it of itensCalc) {
    const ordem = it.ordem ?? -1;
    const itemRow = itemRows.find((r) => r.ordem === ordem);
    if (!itemRow) continue;
    const analise = analisarEscalaFobItem(it, it.benchmark);
    const fobPersistir = bloquearPersistenciaFobCorrupto(analise)
      ? Number(itemRow.fobTotalUS)
      : (it.fobTotalUS ?? 0);
    const avisosEscala =
      analise.flags.length > 0
        ? [`[FOB escala] ${analise.flags.join(", ")} ratio=${analise.ratio?.toFixed(1) ?? "—"}`]
        : [];
    const metaNovo = {
      ...extrairItemMeta(it),
      fobKgAvisos: [...(it.fobKgAvisos ?? []), ...avisosEscala].filter(Boolean).length
        ? [...(it.fobKgAvisos ?? []), ...avisosEscala]
        : it.fobKgAvisos,
    };
    await tx.item.update({
      where: { id: itemRow.id },
      data: {
        descPt: it.descPt ?? "",
        descDuimp: it.descDuimp ?? "",
        ncm: it.ncm || "00000000",
        ncmCandidatos: (it.ncmCandidatos ?? []) as Prisma.InputJsonValue,
        fobTotalUS: fobPersistir,
        fobUnitarioUS: it.fobUnitarioUS ?? null,
        aliquotas: it.aliquotas as Prisma.InputJsonValue,
        aliquotasOverride: it.aliquotasOverride ?? false,
        benchmark: (it.benchmark ?? undefined) as Prisma.InputJsonValue | undefined,
        calibracao: (it.calibracao ?? undefined) as Prisma.InputJsonValue | undefined,
        risco: (it.risco ?? undefined) as Prisma.InputJsonValue | undefined,
        meta: metaNovo as Prisma.InputJsonValue,
      },
    });
  }
}

export async function listarCotacoes(tenantSlug: string, opts?: { cliente?: string; limite?: number }) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const tid = await tidFromSlug(tenantSlug);
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
      const markupPct = (r.params as Cotacao["params"]).markupPct ?? 0.04;
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

export async function buscarCotacao(id: string, tenantSlug: string, state: AppState) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(id, tenantSlug);
  if (!row) return null;
  return cotacaoRecalculadaFromRow(row as CotacaoComRelacoes, state);
}

export async function duplicarCotacao(
  id: string,
  tenantSlug: string,
  state: AppState,
  opts?: { markupPct?: number; cliente?: string },
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const orig = await buscarCotacaoRow(id, tenantSlug);
  if (!orig) return null;

  const { cotacao } = mapRowParaDominio(orig);
  const params = { ...cotacao.params };
  if (opts?.markupPct != null) params.markupPct = opts.markupPct;

  const nova: Cotacao = {
    ...cotacao,
    id: undefined,
    cliente: opts?.cliente?.trim() || `${cotacao.cliente} (cópia)`,
    params,
    avisosFiscais: [...(cotacao.avisosFiscais ?? [])],
    itens: cotacao.itens.map((it) => ({ ...it, id: undefined })),
  };

  const destino = normalizarUf(nova.destino) ?? "SP";
  nova.destino = destino;

  const { resultado, itens, params: paramsCalc } = calcularCotacao(nova, state);
  nova.params = paramsCalc;
  return salvarCotacao({ tenantSlug, cotacao: nova, itens, resultado, provider: undefined });
}

export interface AtualizarCotacaoInput {
  origem?: string;
  destino?: string;
  benefFiscal?: Cotacao["benefFiscal"];
  ufEmpresa?: string;
  regimeIcms?: Cotacao["regimeIcms"];
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
  /** Se true, recalcula icmsSaida via resolver (ignora override manual). avisosFiscais preservados. */
  icmsAuto?: boolean;
  /** Aceita ICMS calculado pelo resolver — limpa avisos legado e icmsSaidaManualFlag. */
  confirmarIcmsSaida?: boolean;
  /** Override de alíquotas de importação por item (ordem = índice na cotação). */
  itensAliquotas?: Array<{
    ordem: number;
    aliquotas?: Item["aliquotas"];
    aliquotasOverride?: boolean;
    desfazerTributos?: ChaveTributoRastro[];
  }>;
}

function mergeIcmsAtualizacao(
  cotacao: Cotacao,
  opts: AtualizarCotacaoInput,
): Pick<Cotacao, "params" | "icmsSaidaManualFlag" | "avisosFiscais"> {
  let manualFlag = cotacao.icmsSaidaManualFlag ?? false;
  let avisos = [...(cotacao.avisosFiscais ?? [])];
  const params = { ...cotacao.params, ...opts.params };
  if (opts.markupPct != null) params.markupPct = opts.markupPct;

  if (opts.confirmarIcmsSaida) {
    manualFlag = false;
    avisos = [];
  } else if (opts.params?.icmsSaida != null && opts.icmsAuto === false) {
    manualFlag = true;
  } else if (opts.icmsAuto === true) {
    manualFlag = false;
  }

  const applied = aplicarIcmsCotacao({
    ufEmpresa:
      opts.ufEmpresa != null
        ? (normalizarUf(opts.ufEmpresa) ?? cotacao.ufEmpresa ?? "AL")
        : (cotacao.ufEmpresa ?? "AL"),
    destino: opts.destino ? (normalizarUf(opts.destino) ?? cotacao.destino) : cotacao.destino,
    regimeIcms: opts.regimeIcms ?? cotacao.regimeIcms ?? "AL_DIFERIDO",
    icmsSaidaManualFlag: manualFlag,
    params,
    avisosFiscais: avisos,
  });

  return {
    params: applied.params,
    icmsSaidaManualFlag: manualFlag,
    avisosFiscais: avisos,
  };
}

export async function atualizarCotacao(id: string, tenantSlug: string, state: AppState, opts: AtualizarCotacaoInput) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(id, tenantSlug);
  if (!row) return null;

  const { cotacao, itens: itensAtuais } = mapRowParaDominio(row);
  const itensDom =
    opts.itensAliquotas?.length
      ? itensAtuais.map((it) => {
          const patch = opts.itensAliquotas!.find((p) => p.ordem === (it.ordem ?? -1));
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
  const ufEmpresa =
    opts.ufEmpresa != null
      ? (normalizarUf(opts.ufEmpresa) ?? cotacao.ufEmpresa ?? "AL")
      : (cotacao.ufEmpresa ?? "AL");
  const regimeIcms = opts.regimeIcms ?? cotacao.regimeIcms ?? "AL_DIFERIDO";
  const benefFiscal = opts.benefFiscal ?? cotacao.benefFiscal;
  const empresaTrade = opts.empresaTrade !== undefined ? opts.empresaTrade.trim() : cotacao.empresaTrade;
  const cliente = opts.cliente !== undefined ? opts.cliente.trim() || "Sem cliente" : cotacao.cliente;
  const despesas = opts.despesas ?? cotacao.despesas;
  const outrasDespesasBaseBRL = opts.outrasDespesasBaseBRL ?? cotacao.outrasDespesasBaseBRL;
  const icmsMerged = mergeIcmsAtualizacao(
    { ...cotacao, ufEmpresa, destino, regimeIcms },
    opts,
  );

  const atualizada: Cotacao = {
    ...cotacao,
    origem,
    destino,
    ufEmpresa,
    regimeIcms,
    benefFiscal,
    empresaTrade,
    cliente,
    despesas,
    outrasDespesasBaseBRL,
    params: icmsMerged.params,
    icmsSaidaManualFlag: icmsMerged.icmsSaidaManualFlag,
    avisosFiscais: icmsMerged.avisosFiscais,
    ...(opts.cambio != null ? { cambio: opts.cambio } : {}),
    ...(opts.freteTotalUS != null ? { freteTotalUS: opts.freteTotalUS } : {}),
    ...(opts.siscomex != null ? { siscomex: opts.siscomex } : {}),
    ...(opts.adicionaisVaUS != null ? { adicionaisVaUS: opts.adicionaisVaUS } : {}),
    ...(opts.reducaoBaseUS != null ? { reducaoBaseUS: opts.reducaoBaseUS } : {}),
    ...(opts.qtdContainers != null ? { qtdContainers: opts.qtdContainers } : {}),
    itens: itensDom,
  };
  const { resultado, itens, params } = calcularCotacao(atualizada, state);
  atualizada.params = params;
  const itensValidados = validarConfirmacaoNcmItens(itens);
  const canal = canalPredominante(itensValidados);

  const updated = await prisma.$transaction(async (tx) => {
    if (opts.despesas) {
      await tx.despesa.deleteMany({ where: { cotacaoId: id } });
    }
    if (opts.itensAliquotas?.length) {
      for (const patch of opts.itensAliquotas) {
        const itemRow = row.itens.find((i) => i.ordem === patch.ordem);
        const idxDom = itensDom.findIndex((it) => (it.ordem ?? -1) === patch.ordem);
        const patchedItem = idxDom >= 0 ? itensValidados[idxDom] : undefined;
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
    await persistirItensPosCalculo(row.itens, itensValidados, tx);
    return tx.cotacao.update({
      where: { id },
      data: {
        origem,
        destino,
        benefFiscal,
        empresaTrade,
        cliente,
        params,
        ...icmsPersistData(atualizada),
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

  return cotacaoRecalculadaFromRow(updated as CotacaoComRelacoes, state);
}

/** @deprecated use atualizarCotacao */
export async function atualizarFiscalCotacao(id: string, tenantSlug: string, state: AppState, opts: AtualizarCotacaoInput) {
  return atualizarCotacao(id, tenantSlug, state, opts);
}


function itemDominioFromRow(itemRow: ItemRowPersist): Item {
  const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
  return validarConfirmacaoNcmItem(
    mesclarItemMeta(
      {
        descOriginal: itemRow.descOriginal,
        descPt: itemRow.descPt,
        descDuimp: itemRow.descDuimp,
        ncm: itemRow.ncm,
        pesoLiqKg: num(itemRow.pesoLiqKg),
        fobTotalUS: num(itemRow.fobTotalUS),
        fobKgManual: numOrNull(itemRow.fobKgManual) ?? undefined,
      } as Item,
      metaAtual,
    ),
  );
}

/** Meta + cache humano — compartilhado pela rota individual e pelo lote. */
export async function confirmarNcmItemInterno(
  itemRow: ItemRowPersist,
  confirmadoPor: string | undefined,
  versoes: Awaited<ReturnType<typeof versoesClassificacaoCacheAtual>>,
  opts?: { tx?: Prisma.TransactionClient; cacheStrict?: boolean },
): Promise<void> {
  const db = opts?.tx ?? prisma;
  const metaAtual = (itemRow.meta as import("@cia/pipeline").ItemMetaPersistido | null) ?? {};
  const ncmNorm = ncm8Limpo(itemRow.ncm);
  const base = mesclarItemMeta(
    {
      descOriginal: itemRow.descOriginal,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
      ncm: ncmNorm,
      pesoLiqKg: num(itemRow.pesoLiqKg),
      fobTotalUS: num(itemRow.fobTotalUS),
    } as Item,
    metaAtual,
  );
  const novoMeta = extrairItemMeta({
    ...base,
    ...metaConfirmacaoNcm(ncmNorm, confirmadoPor),
    ncmValido: true,
  });

  await db.item.update({
    where: { id: itemRow.id },
    data: { ncm: ncmNorm, meta: novoMeta as Prisma.InputJsonValue },
  });

  await salvarClassificacaoCacheHumano(
    {
      descOriginal: itemRow.descOriginal,
      material: metaAtual.material,
      uso: metaAtual.uso,
    },
    versoes,
    outputConfirmacaoHumana({
      descOriginal: itemRow.descOriginal,
      material: metaAtual.material,
      uso: metaAtual.uso,
      ncmConfirmado: ncmNorm,
      descPt: itemRow.descPt,
      descDuimp: itemRow.descDuimp,
    }),
    { strict: opts?.cacheStrict, tx: opts?.tx },
  );
}

export type ConfirmarNcmLoteResult = ReturnType<typeof formatCotacaoSalva> extends infer T
  ? T extends object
    ? T & { aprovados: number; pulados: number; pendentes: number }
    : never
  : never;

async function recalcularCotacaoPersistida(
  cotacaoId: string,
  tenantSlug: string,
  state: AppState,
  rowAntes: CotacaoComRelacoes,
) {
  const refreshed = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!refreshed) return null;

  const { cotacao, itens: itensDb } = mapRowParaDominio(refreshed);
  const calc = calcularCotacao(cotacao, state);
  const itensValidados = validarConfirmacaoNcmItens(mesclarOrdemItensPersistidos(calc.itens, itensDb));
  const canal = canalPredominante(itensValidados);

  await prisma.$transaction(async (tx) => {
    await persistirItensPosCalculo(refreshed.itens, itensValidados, tx);
    await tx.cotacao.update({
      where: { id: cotacaoId },
      data: {
        status: calc.resultado ? "CALCULADA" : rowAntes.status,
        totalBRL: calc.resultado?.totalBRL ?? null,
        totalUS: calc.resultado?.totalUS ?? null,
        canalPredominante: canal,
        params: calc.params as Prisma.InputJsonValue,
        resultadoCalculo: (calc.resultado ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        calculadoEm: calc.resultado ? new Date() : rowAntes.calculadoEm,
      },
    });
  });

  const rowAtualizado = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!rowAtualizado) return null;
  return cotacaoRecalculadaFromRow(rowAtualizado as CotacaoComRelacoes, state);
}

/** Reclassifica NCM dos itens salvos (planilha cliente → IA) e recalcula — corrige cotações gravadas antes do fix. */
async function prepararReclassificacaoCotacaoPersistida(
  row: CotacaoComRelacoes,
  state: AppState,
  opts?: { gravarCacheClassificacao?: boolean },
) {
  const { cotacao: cotacaoPersistida, itens: itensDb } = mapRowParaDominio(row);
  const cotacao = normalizarCotacaoLegadaCot72(cotacaoPersistida, row.id);
  const linhas = linhasCruasFromItensPersistidos(row.itens);
  const montado = await montarItens(linhas, state, {
    moedaPlanilha: cotacao.moedaPlanilha,
    cambioEurUsd: cotacao.cambioEurUsd,
    gravarCacheClassificacao: opts?.gravarCacheClassificacao !== false,
  });

  const itensNovos = montado.itens.map((it, i) => {
    const antigo = itensDb[i];
    return {
      ...it,
      id: antigo?.id,
      ordem: antigo?.ordem ?? i,
      fobKgManual: antigo?.fobKgManual,
      aliquotasOverride: antigo?.aliquotasOverride ?? false,
      ...(antigo?.aliquotasOverride ? { aliquotas: antigo.aliquotas } : {}),
    };
  });

  const cotacaoCalc: Cotacao = { ...cotacao, itens: itensNovos };
  const calc = calcularCotacao(cotacaoCalc, state);
  const itensValidados = validarConfirmacaoNcmItens(
    mesclarOrdemItensPersistidos(calc.itens, itensNovos),
  );
  const canal = canalPredominante(itensValidados);

  return { cotacao, itensDb, montado, itensNovos, calc, itensValidados, canal };
}

export async function dryRunReclassificarCotacaoPersistida(
  cotacaoId: string,
  tenantSlug: string,
  state: AppState,
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const rowOriginal = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!rowOriginal) return null;

  const row = rowOriginal as CotacaoComRelacoes;
  const { row: rowSimulado, limpezas } = rowComLimpezaNcmInjetado(row);
  const antesDominio = mapRowParaDominio(row);
  const preparado = await prepararReclassificacaoCotacaoPersistida(rowSimulado, state, {
    gravarCacheClassificacao: false,
  });

  const itensAntes = [...antesDominio.itens].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const itensDepois = [...preparado.itensValidados].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const itens = itensAntes.map((antes, i) => {
    const depois = itensDepois[i]!;
    const resumoAntes = resumoItemReclassificacao(antes, fiscalPorIndice(antesDominio.resultado, i));
    const resumoDepois = resumoItemReclassificacao(depois, fiscalPorIndice(preparado.calc.resultado, i));
    return {
      ordem: antes.ordem ?? i,
      descOriginal: antes.descOriginal,
      antes: resumoAntes,
      depois: resumoDepois,
      mudou: camposAlteradosReclassificacao(resumoAntes, resumoDepois),
    };
  });

  const fobAntes = itensAntes.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
  const fobDepois = itensDepois.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);

  return {
    dryRun: true as const,
    cotacaoId,
    tenantSlug,
    provider: preparado.montado.provider,
    limpezaNcmInjetado: {
      itensAfetados: limpezas.length,
      itens: limpezas,
    },
    antes: {
      totalItens: itensAntes.length,
      totalUS: numOrNull(row.totalUS),
      totalBRL: numOrNull(row.totalBRL),
      markupPct: antesDominio.cotacao.params.markupPct,
      updatedAt: row.atualizadoEm.toISOString(),
      fobTotalUS: fobAntes,
      iiTotalBRL: antesDominio.resultado?.entrada.iiTotal ?? null,
      ipiTotalBRL: antesDominio.resultado?.entrada.ipiTotal ?? null,
      pisTotalBRL: antesDominio.resultado?.entrada.pisTotal ?? null,
      cofinsTotalBRL: antesDominio.resultado?.entrada.cofinsTotal ?? null,
    },
    depois: {
      totalItens: itensDepois.length,
      totalUS: preparado.calc.resultado.totalUS,
      totalBRL: preparado.calc.resultado.totalBRL,
      markupPct: preparado.calc.params.markupPct,
      canalPredominante: preparado.canal,
      fobTotalUS: fobDepois,
      iiTotalBRL: preparado.calc.resultado.entrada.iiTotal,
      ipiTotalBRL: preparado.calc.resultado.entrada.ipiTotal,
      pisTotalBRL: preparado.calc.resultado.entrada.pisTotal,
      cofinsTotalBRL: preparado.calc.resultado.entrada.cofinsTotal,
    },
    itens,
  };
}

export async function reclassificarCotacaoPersistida(
  cotacaoId: string,
  tenantSlug: string,
  state: AppState,
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!row) return null;

  const preparado = await prepararReclassificacaoCotacaoPersistida(row as CotacaoComRelacoes, state);

  await prisma.$transaction(async (tx) => {
    await persistirItensPosReclassificacao(row.itens, preparado.itensValidados, tx);
    await tx.cotacao.update({
      where: { id: cotacaoId },
      data: {
        status: preparado.calc.resultado ? "CALCULADA" : row.status,
        totalBRL: preparado.calc.resultado?.totalBRL ?? null,
        totalUS: preparado.calc.resultado?.totalUS ?? null,
        canalPredominante: preparado.canal,
        params: preparado.calc.params as Prisma.InputJsonValue,
        resultadoCalculo: (preparado.calc.resultado ?? undefined) as unknown as Prisma.InputJsonValue | undefined,
        calculadoEm: preparado.calc.resultado ? new Date() : row.calculadoEm,
      },
    });
  });

  const rowAtualizado = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!rowAtualizado) return null;
  return cotacaoRecalculadaFromRow(rowAtualizado as CotacaoComRelacoes, state, preparado.montado.provider);
}

/** Marca item com revisão humana do NCM (persiste em Item.meta + recalcula cotação). */
export async function confirmarNcmItem(
  cotacaoId: string,
  tenantSlug: string,
  ordem: number,
  confirmadoPor?: string,
  state?: AppState,
  provider?: string,
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!row) return null;

  const itemRow = row.itens.find((i) => i.ordem === ordem);
  if (!itemRow) return null;

  const catalog = state?.ncmCatalog;
  const it = itemDominioFromRow(itemRow);
  if (!ncmInformadoParaFechamento(it)) return null;
  if (confirmacaoNcmVigente(it)) {
    return formatCotacaoSalva(row as CotacaoComRelacoes, provider, catalog);
  }

  const versoes = await versoesClassificacaoCacheAtual();
  await confirmarNcmItemInterno(itemRow, confirmadoPor, versoes, { cacheStrict: false });

  if (state) {
    const recalculada = await recalcularCotacaoPersistida(cotacaoId, tenantSlug, state, row);
    if (recalculada) {
      return { ...recalculada, provider: provider ?? recalculada.provider };
    }
  }

  const atualizada = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!atualizada) return null;
  return formatCotacaoSalva(atualizada as CotacaoComRelacoes, provider, catalog);
}

/** Confirma em lote todos os itens elegíveis (itemPodeConfirmarNcm), recalcula no fim. */
export async function confirmarNcmItensLote(
  cotacaoId: string,
  tenantSlug: string,
  confirmadoPor: string | undefined,
  state: AppState,
  provider?: string,
): Promise<ConfirmarNcmLoteResult | null> {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!row) return null;

  const versoes = await versoesClassificacaoCacheAtual();
  const sortedRows = [...row.itens].sort((a, b) => a.ordem - b.ordem);
  const ctx = criarPdfNcmAuditCtx(state.ncmCatalog);

  let pulados = 0;
  const elegiveis: ItemRowPersist[] = [];

  for (const itemRow of sortedRows) {
    const it = itemDominioFromRow(itemRow);
    if (confirmacaoNcmVigente(it)) {
      pulados++;
      continue;
    }
    if (!ncmInformadoParaFechamento(it)) continue;
    elegiveis.push(itemRow);
  }

  let aprovados = 0;
  if (elegiveis.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const itemRow of elegiveis) {
        await confirmarNcmItemInterno(itemRow, confirmadoPor, versoes, { tx, cacheStrict: true });
        aprovados++;
      }
    });
  }

  const recalculada = await recalcularCotacaoPersistida(cotacaoId, tenantSlug, state, row);
  if (!recalculada) return null;

  const pendentes = itensResolucaoNcm(recalculada.itens, ctx).length;

  return {
    ...recalculada,
    provider: provider ?? recalculada.provider,
    aprovados,
    pulados,
    pendentes,
  };
}

/** Remove revisão humana do NCM (item volta a bloquear PDF). */
export async function desfazerConfirmacaoNcmItem(
  cotacaoId: string,
  tenantSlug: string,
  ordem: number,
  provider?: string,
  catalog?: NcmCatalog,
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
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

  const atualizada = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!atualizada) return null;
  return formatCotacaoSalva(atualizada as CotacaoComRelacoes, provider, catalog);
}

/** Altera NCM do item salvo, limpa confirmação humana e recalcula a cotação. */
export async function alterarNcmItem(cotacaoId: string, tenantSlug: string, ordem: number, ncmNovo: string, state: AppState) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const ncm = ncm8Limpo(ncmNovo);
  if (!ncm || ncm === "00000000") throw new Error("NCM inválido (8 dígitos).");

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
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
  const familiaId =
    base.familiaProdutoId ??
    detectarFamilia({ descOriginal: base.descOriginal, uso: base.uso })?.id;
  const tec =
    !itemRow.aliquotasOverride
      ? await (state.tecSource.buscarAsync?.(ncm) ??
          Promise.resolve(state.tecSource.buscar(ncm)))
      : null;
  const itemAtualizado = {
    ...limparConfirmacaoNcm(base),
    ncm,
    ncmValido: true,
    ncmFonte: metaAtual.ncmFonte === "pendente" ? "planilha" : (metaAtual.ncmFonte ?? "planilha"),
    compatibilidadeProduto: "compativel" as const,
    motivoCompatibilidade: undefined,
    ...(familiaId ? { familiaProdutoId: familiaId } : {}),
    ...(tec?.aliquotas ? { aliquotas: tec.aliquotas, aliquotasRastro: tec.rastros } : {}),
  };
  const novoMeta = extrairItemMeta(itemAtualizado);

  await prisma.item.update({
    where: { id: itemRow.id },
    data: {
      ncm,
      meta: novoMeta as Prisma.InputJsonValue,
      ...(tec?.aliquotas ? { aliquotas: tec.aliquotas as Prisma.InputJsonValue } : {}),
    },
  });

  const recalculada = await recalcularCotacaoPersistida(cotacaoId, tenantSlug, state, row);
  if (!recalculada) return null;

  return recalculada;
}

/** Override manual FOB/kg — recalcula cotação inteira; aviso informativo se abaixo do piso. */
export async function alterarFobKgItem(
  cotacaoId: string,
  tenantSlug: string,
  ordem: number,
  fobKgManual: number | null,
  state: AppState,
) {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  if (fobKgManual !== null && (!Number.isFinite(fobKgManual) || fobKgManual < 0)) {
    throw new Error("fobKgManual inválido.");
  }

  const row = await buscarCotacaoRow(cotacaoId, tenantSlug);
  if (!row) return null;

  const itemRow = row.itens.find((i) => i.ordem === ordem);
  if (!itemRow) return null;

  const valor =
    fobKgManual === null || fobKgManual === 0 ? null : Number(fobKgManual.toFixed(6));

  await prisma.item.update({
    where: { id: itemRow.id },
    data: { fobKgManual: valor },
  });

  const recalculada = await recalcularCotacaoPersistida(cotacaoId, tenantSlug, state, row);
  if (!recalculada) return null;

  const itemAtualizado = recalculada.itens.find((it) => (it.ordem ?? -1) === ordem);
  const calibracao = itemAtualizado?.calibracao;
  const fobKgFinal =
    itemAtualizado && calibracao ? fobKgFinalItem(itemAtualizado, calibracao) : null;
  const avisoValoracao: AvisoValoracao | null =
    valor != null && valor > 0 && itemAtualizado
      ? calcAvisoValoracaoFobKg(valor, itemAtualizado.benchmark)
      : null;

  return { ...recalculada, ordem, fobKgFinal, avisoValoracao };
}

export async function excluirCotacao(id: string, tenantSlug: string): Promise<boolean> {
  if (!dbAtivo()) throw new PersistenciaIndisponivelError();

  const row = await buscarCotacaoRow(id, tenantSlug);
  if (!row) return false;

  await prisma.cotacao.delete({ where: { id: row.id } });
  await excluirFotosCotacao(id);
  return true;
}
