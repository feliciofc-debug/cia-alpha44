/** Cache Postgres de classificação NCM (P3b) — lookup antes do LLM, grava após. */

import { prisma } from "@cia/db";
import {
  catalogVersionKey,
  chaveClassificacaoCache,
  criarNcmCatalog,
  loadNcmVigenteCache,
  validarNcmParaCacheHumano,
  type ClassificacaoCacheKeyInput,
  type NcmCatalog,
} from "@cia/pipeline";
import type { Prisma } from "@prisma/client";
import { CLASSIFICACAO_PROMPT_VERSION } from "../llm/prompt-2passes.js";
import type { ClassifyItemOutput } from "../llm/types.js";

export interface ClassificacaoCacheStats {
  hits: number;
  misses: number;
  humanos: number;
  total: number;
}

export interface ClassificacaoCacheVersoes {
  promptVersion: string;
  catalogVersion: string;
}

function dbAtivo(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function parseResultado(raw: unknown): ClassifyItemOutput | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as ClassifyItemOutput;
  if (typeof o.descPt !== "string" || typeof o.descDuimp !== "string") return null;
  if (!Array.isArray(o.ncmCandidatos)) return null;
  return o;
}

export function versoesClassificacaoCache(catalog: NcmCatalog): ClassificacaoCacheVersoes {
  return {
    promptVersion: CLASSIFICACAO_PROMPT_VERSION,
    catalogVersion: catalogVersionKey(catalog),
  };
}

export async function versoesClassificacaoCacheAtual(): Promise<ClassificacaoCacheVersoes> {
  const cache = loadNcmVigenteCache();
  const catalog = criarNcmCatalog(cache);
  return versoesClassificacaoCache(catalog);
}

export interface ClassificacaoCacheLookup {
  output: ClassifyItemOutput;
  confirmadoHumano: boolean;
}

/**
 * Entradas antigas ou incompatíveis com o contexto atual — nunca reutilizar como classificador NCM.
 * `planilha-cliente*` só é confiável quando a linha atual tem coluna NCM real.
 */
export function cacheClassificacaoToxico(
  output: ClassifyItemOutput,
  opts?: { temColunaNcmReal?: boolean },
): boolean {
  const prov = (output as unknown as Record<string, unknown>).classificacaoProvedor;
  if (prov === "planilha-china") return true;
  if (
    opts?.temColunaNcmReal === false &&
    (prov === "planilha-cliente" || prov === "planilha-cliente-familia")
  ) {
    return true;
  }
  return false;
}

/** Lookup com metadados — retorna null se miss, versão divergente ou DB indisponível. */
export async function lookupClassificacaoCacheDetalhe(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
): Promise<ClassificacaoCacheLookup | null> {
  if (!dbAtivo()) return null;

  const chave = chaveClassificacaoCache(input, versoes.promptVersion, versoes.catalogVersion);
  try {
    const row = await prisma.classificacaoCache.findUnique({ where: { chave } });
    if (!row) return null;
    if (row.promptVersion !== versoes.promptVersion || row.catalogVersion !== versoes.catalogVersion) {
      return null;
    }
    const parsed = parseResultado(row.resultado);
    if (!parsed) return null;

    await prisma.classificacaoCache.update({
      where: { chave },
      data: { hitCount: { increment: 1 } },
    });
    return { output: parsed, confirmadoHumano: row.confirmadoHumano };
  } catch {
    return null;
  }
}

/** Lookup — retorna null se miss, versão divergente ou DB indisponível. */
export async function lookupClassificacaoCache(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
): Promise<ClassifyItemOutput | null> {
  const hit = await lookupClassificacaoCacheDetalhe(input, versoes);
  return hit?.output ?? null;
}

/** Grava resultado LLM — não sobrescreve entrada confirmada por humano. */
export async function salvarClassificacaoCacheLlm(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
  resultado: ClassifyItemOutput,
): Promise<void> {
  if (!dbAtivo()) return;
  if (!resultado.ncmCandidatos?.length) return;

  const chave = chaveClassificacaoCache(input, versoes.promptVersion, versoes.catalogVersion);
  const json = resultado as unknown as Prisma.InputJsonValue;

  try {
    const existente = await prisma.classificacaoCache.findUnique({
      where: { chave },
      select: { confirmadoHumano: true },
    });
    if (existente?.confirmadoHumano) return;

    await prisma.classificacaoCache.upsert({
      where: { chave },
      create: {
        chave,
        promptVersion: versoes.promptVersion,
        catalogVersion: versoes.catalogVersion,
        resultado: json,
        confirmadoHumano: false,
      },
      update: {
        promptVersion: versoes.promptVersion,
        catalogVersion: versoes.catalogVersion,
        resultado: json,
      },
    });
  } catch {
    /* cache best-effort */
  }
}

export type SalvarClassificacaoCacheHumanoOpts = {
  /** Lote: propaga erro e reverte transação. Individual: best-effort (default). */
  strict?: boolean;
  tx?: Prisma.TransactionClient;
  /** Ignorar validação de coerência (apenas testes internos — não usar em prod). */
  skipCoerencia?: boolean;
};

export class CacheHumanoIncoerenteError extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = "CacheHumanoIncoerenteError";
  }
}

/** Grava ou atualiza cache a partir de confirmação humana — prevalece sobre LLM. */
export async function salvarClassificacaoCacheHumano(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
  resultado: ClassifyItemOutput,
  opts?: SalvarClassificacaoCacheHumanoOpts,
): Promise<void> {
  if (!dbAtivo()) return;

  const ncm = resultado.ncmCandidatos?.[0]?.ncm;
  if (ncm && !opts?.skipCoerencia) {
    const catalog = criarNcmCatalog(loadNcmVigenteCache());
    const val = validarNcmParaCacheHumano(catalog, input, ncm);
    if (!val.ok) {
      if (opts?.strict) throw new CacheHumanoIncoerenteError(val.motivo ?? "NCM incoerente.");
      console.warn(`[classificacao-cache] ${val.motivo}`);
      return;
    }
  }

  const chave = chaveClassificacaoCache(input, versoes.promptVersion, versoes.catalogVersion);
  const json = resultado as unknown as Prisma.InputJsonValue;
  const db = opts?.tx ?? prisma;

  try {
    await db.classificacaoCache.upsert({
      where: { chave },
      create: {
        chave,
        promptVersion: versoes.promptVersion,
        catalogVersion: versoes.catalogVersion,
        resultado: json,
        confirmadoHumano: true,
      },
      update: {
        promptVersion: versoes.promptVersion,
        catalogVersion: versoes.catalogVersion,
        resultado: json,
        confirmadoHumano: true,
      },
    });
  } catch (e) {
    if (opts?.strict) throw e;
    /* cache best-effort (confirmação individual) */
  }
}

export function criarStatsClassificacaoCache(total: number): ClassificacaoCacheStats {
  return { hits: 0, misses: 0, humanos: 0, total };
}

export function outputConfirmacaoHumana(
  input: ClassificacaoCacheKeyInput & { ncmConfirmado: string; descPt?: string; descDuimp?: string },
): ClassifyItemOutput {
  const descPt = input.descPt?.trim() || input.descOriginal;
  const ncm = input.ncmConfirmado.replace(/\D/g, "").slice(0, 8);
  return {
    descPt,
    descDuimp: input.descDuimp?.trim() || `${descPt} — NCM confirmado manualmente (${ncm}).`,
    ncmCandidatos: [{ ncm, confianca: 1 }],
    justificativaRGI: "NCM confirmado por revisão humana — cache/LLM ignorados.",
  };
}
