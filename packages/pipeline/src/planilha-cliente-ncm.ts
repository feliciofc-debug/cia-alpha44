/**
 * NCM da planilha de embarque do cliente (fatura cotada) — autoridade de classificação.
 * Herança por família usa SOMENTE outras linhas do mesmo upload (zero benchmark China).
 */

import {
  candidatosSiscomexPorDescricao,
  detectarFamilia,
  MIN_SCORE_BUSCA_NCM,
  ncmCoerenteComFamilia,
  type FamiliaProduto,
} from "./classificar-ncm.js";
import type { LinhaCrua } from "./linha.js";
import { normNcm8, normalizarCodigoNcmCliente, type NcmCatalog } from "./ncm-catalog.js";
import { resolverDescPtFornecedor } from "./traducao-pt.js";
import { tokensProdutoSemCor } from "./tokens-cor-produto.js";

export interface PlanilhaClienteNcmHit {
  ncm: string;
  confianca: number;
  provedor: "planilha-cliente" | "planilha-cliente-hs6" | "planilha-cliente-familia";
  linhaReferencia?: number;
  hs6?: string;
}

export interface ClassificarSiscomexOutput {
  descPt: string;
  descDuimp: string;
  ncmCandidatos: Array<{ ncm: string; descricaoOficial?: string; confianca: number }>;
  classificacaoProvedor: "siscomex";
}

function tokenCombina(query: string, desc: string): boolean {
  if (query === desc) return true;
  const min = 4;
  if (query.length >= min && desc.startsWith(query)) return true;
  if (desc.length >= min && query.startsWith(desc)) return true;
  return false;
}

function scoreDescricoes(a: string, b: string): number {
  const ta = tokensProdutoSemCor(a);
  const tb = tokensProdutoSemCor(b);
  if (!ta.length || !tb.length) return 0;
  let matches = 0;
  for (const t of ta) {
    if (tb.some((u) => tokenCombina(t, u))) matches++;
  }
  return matches / Math.max(ta.length, tb.length);
}

function candidatosPorHs6(catalog: NcmCatalog, hs6: string): Array<{ ncm: string; descricao: string }> {
  return catalog.listarPorCapitulo(hs6.slice(0, 4)).filter((c) => c.ncm.startsWith(hs6));
}

function scoreResidual(ncm: string, descricao: string): number {
  let score = 0;
  if (/^outr[oa]s?$/i.test(descricao.trim()) || /\boutr[oa]s?\b/i.test(descricao)) score += 4;
  if (ncm.endsWith("90")) score += 3;
  if (ncm.endsWith("99")) score += 2;
  return score;
}

function resolverNcmPorHs6(
  hs6: string,
  linha: LinhaCrua,
  catalog: NcmCatalog,
): PlanilhaClienteNcmHit | null {
  if (!/^\d{6}$/.test(hs6)) return null;
  const candidatos = candidatosPorHs6(catalog, hs6);
  if (candidatos.length === 0) return null;
  if (candidatos.length === 1) {
    return { ncm: candidatos[0]!.ncm, confianca: 0.93, provedor: "planilha-cliente-hs6", hs6 };
  }

  const familia = detectarFamilia({ descOriginal: linha.descOriginal, uso: linha.uso });
  const textual = candidatosSiscomexPorDescricao(catalog, linha.descOriginal, familia, 20)
    .filter((c) => c.ncm.startsWith(hs6) && c.confianca >= MIN_SCORE_BUSCA_NCM)
    .sort((a, b) => b.confianca - a.confianca)[0];
  if (textual) {
    return { ncm: textual.ncm, confianca: Math.min(0.92, textual.confianca), provedor: "planilha-cliente-hs6", hs6 };
  }

  const residual = [...candidatos].sort(
    (a, b) => scoreResidual(b.ncm, b.descricao) - scoreResidual(a.ncm, a.descricao) || a.ncm.localeCompare(b.ncm),
  )[0];
  if (!residual) return null;
  return { ncm: residual.ncm, confianca: 0.88, provedor: "planilha-cliente-hs6", hs6 };
}

/** NCM declarado na coluna embarque — válido na TEC e coerente com família. */
export function resolverNcmDeclaradoCliente(
  input: { ncmInformado?: string | null },
  linha: LinhaCrua,
  catalog: NcmCatalog,
): PlanilhaClienteNcmHit | null {
  const bruto = normalizarCodigoNcmCliente(input.ncmInformado ?? linha.ncm ?? "");
  if (!bruto) return null;

  const familia = detectarFamilia({ descOriginal: linha.descOriginal, uso: linha.uso });
  const ncm = bruto.length === 8 ? normNcm8(bruto) : null;
  if (ncm && catalog.existe(ncm)) {
    if (familia && !ncmCoerenteComFamilia(ncm, familia)) return null;

    return { ncm, confianca: 0.95, provedor: "planilha-cliente" };
  }

  if (bruto.length === 10 || bruto.length === 8) {
    return resolverNcmPorHs6(bruto.slice(0, 6), linha, catalog);
  }

  return null;
}

/** Herda NCM de outra linha do mesmo upload (mesma família, descrição mais próxima). */
export function resolverNcmHerancaFamiliaFatura(
  linha: LinhaCrua,
  linhas: LinhaCrua[],
  catalog: NcmCatalog,
  indiceAtual?: number,
): PlanilhaClienteNcmHit | null {
  const familia = detectarFamilia({ descOriginal: linha.descOriginal, uso: linha.uso });
  if (!familia) return null;

  let best: { ncm: string; score: number; idx: number } | null = null;

  for (let j = 0; j < linhas.length; j++) {
    if (indiceAtual != null && j === indiceAtual) continue;
    const other = linhas[j]!;
    const ncm = normNcm8(other.ncm ?? "");
    if (!ncm || !catalog.existe(ncm)) continue;
    if (!ncmCoerenteComFamilia(ncm, familia)) continue;

    const score = scoreDescricoes(linha.descOriginal, other.descOriginal);
    if (score < MIN_SCORE_BUSCA_NCM) continue;
    if (!best || score > best.score) best = { ncm, score, idx: j };
  }

  if (!best) return null;
  return {
    ncm: best.ncm,
    confianca: 0.85,
    provedor: "planilha-cliente-familia",
    linhaReferencia: best.idx,
  };
}

function familiaLinha(linha: LinhaCrua): FamiliaProduto | null {
  return detectarFamilia({ descOriginal: linha.descOriginal, uso: linha.uso });
}

/** Siscomex textual — último recurso após IA/Gemini falharem. */
export function classificarSiscomexUltimoRecurso(
  linha: LinhaCrua,
  catalog: NcmCatalog,
): ClassificarSiscomexOutput | null {
  const familia = familiaLinha(linha);
  const candidatos = candidatosSiscomexPorDescricao(catalog, linha.descOriginal, familia);
  const top = candidatos[0];
  if (!top) return null;
  if (familia && !ncmCoerenteComFamilia(top.ncm, familia)) return null;

  const descOficial = top.descricaoOficial ?? catalog.descricao(top.ncm) ?? top.ncm;
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(linha.descOriginal);
  return {
    descPt,
    descDuimp: `${descOficial} — NCM inferido Siscomex (último recurso).`,
    ncmCandidatos: candidatos,
    classificacaoProvedor: "siscomex",
    ...(avisoTraducao ? { avisoTraducao } : {}),
  };
}
