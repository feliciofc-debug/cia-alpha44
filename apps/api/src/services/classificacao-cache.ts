/** Cache Postgres de classificação NCM (P3b) — lookup antes do LLM, grava após. */

import { prisma } from "@cia/db";
import {
  catalogVersionKey,
  chaveClassificacaoCache,
  criarNcmCatalog,
  loadNcmVigenteCache,
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

/** Lookup — retorna null se miss, versão divergente ou DB indisponível. */
export async function lookupClassificacaoCache(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
): Promise<ClassifyItemOutput | null> {
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
    return parsed;
  } catch {
    return null;
  }
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

/** Grava ou atualiza cache a partir de confirmação humana — prevalece sobre LLM. */
export async function salvarClassificacaoCacheHumano(
  input: ClassificacaoCacheKeyInput,
  versoes: ClassificacaoCacheVersoes,
  resultado: ClassifyItemOutput,
): Promise<void> {
  if (!dbAtivo()) return;

  const chave = chaveClassificacaoCache(input, versoes.promptVersion, versoes.catalogVersion);
  const json = resultado as unknown as Prisma.InputJsonValue;

  try {
    await prisma.classificacaoCache.upsert({
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
  } catch {
    /* cache best-effort */
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
