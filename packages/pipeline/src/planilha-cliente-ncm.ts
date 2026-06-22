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
import { normNcm8, type NcmCatalog } from "./ncm-catalog.js";
import { tokensProdutoSemCor } from "./tokens-cor-produto.js";

export interface PlanilhaClienteNcmHit {
  ncm: string;
  confianca: number;
  provedor: "planilha-cliente" | "planilha-cliente-familia";
  linhaReferencia?: number;
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

/** NCM declarado na coluna embarque — válido na TEC e coerente com família. */
export function resolverNcmDeclaradoCliente(
  input: { ncmInformado?: string | null },
  linha: LinhaCrua,
  catalog: NcmCatalog,
): PlanilhaClienteNcmHit | null {
  const bruto = (input.ncmInformado ?? linha.ncm ?? "").trim();
  const ncm = normNcm8(bruto);
  if (!ncm || !catalog.existe(ncm)) return null;

  const familia = detectarFamilia({ descOriginal: linha.descOriginal, uso: linha.uso });
  if (familia && !ncmCoerenteComFamilia(ncm, familia)) return null;

  return { ncm, confianca: 0.95, provedor: "planilha-cliente" };
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
  return {
    descPt: linha.descOriginal.trim(),
    descDuimp: `${descOficial} — NCM inferido Siscomex (último recurso).`,
    ncmCandidatos: candidatos,
    classificacaoProvedor: "siscomex",
  };
}
