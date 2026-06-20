/**
 * NCM + FOB/kg da planilha operacional IMPORTAÇÕES DA CHINA por descrição do produto.
 * Conciliação usa este lookup — nunca substitui por NCM Siscomex/IA operacional.
 */

import type { Item } from "@cia/shared";
import type { BenchmarkPlanilhaEntry } from "./benchmark-planilha.js";
import { normalizarNcm, type BenchmarkIndex } from "./benchmark.js";
import { detectarFamilia, prefixoBuscaPrincipal } from "./classificar-ncm.js";
import { ncmNaPlanilhaChinaIndex } from "./planilha-china-fob.js";

export interface PlanilhaChinaNcmHit {
  ncm: string;
  desc: string;
  fobKgMedioDI: number;
  score: number;
}

export const MIN_SCORE_BUSCA_PLANILHA_CHINA = 0.12;

function tokensTexto(texto: string): string[] {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
}

function tokenCombina(query: string, desc: string): boolean {
  if (query === desc) return true;
  const min = 4;
  if (query.length >= min && desc.startsWith(query)) return true;
  if (desc.length >= min && query.startsWith(desc)) return true;
  return false;
}

function pontuarDescricao(queryTokens: Set<string>, desc: string): { score: number; tokensCasados: number } {
  const tokensDesc = tokensTexto(desc);
  let pontos = 0;
  let tokensCasados = 0;
  for (const t of queryTokens) {
    if (tokensDesc.some((d) => tokenCombina(t, d))) {
      pontos += 2;
      tokensCasados++;
    }
  }
  const score = queryTokens.size > 0 ? pontos / (queryTokens.size * 2) : 0;
  return { score, tokensCasados };
}

/** Busca textual na planilha China (descrições oficiais das linhas de importação). */
export function buscarNcmPlanilhaChinaPorDescricao(
  texto: string,
  itens: BenchmarkPlanilhaEntry[],
  opts?: { capitulo4?: string; limite?: number; minScore?: number },
): PlanilhaChinaNcmHit[] {
  const cap = opts?.capitulo4?.replace(/\D/g, "").slice(0, 4);
  const qt = new Set(tokensTexto(texto));
  if (!qt.size || !itens.length) return [];

  const minScore = opts?.minScore ?? MIN_SCORE_BUSCA_PLANILHA_CHINA;
  const scored: PlanilhaChinaNcmHit[] = [];

  for (const row of itens) {
    const ncm = normalizarNcm(row.ncm);
    if (!ncm || ncm === "00000000") continue;
    if (cap && !ncm.startsWith(cap)) continue;
    const fobKg = row.fobKgMedioDI ?? row.fobKg ?? 0;
    if (fobKg <= 0) continue;

    const { score, tokensCasados } = pontuarDescricao(qt, row.desc);
    if (score < minScore || tokensCasados === 0) continue;
    scored.push({ ncm, desc: row.desc, fobKgMedioDI: fobKg, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || b.fobKgMedioDI - a.fobKgMedioDI)
    .slice(0, opts?.limite ?? 5);
}

function textoBuscaItem(it: Item): string {
  const partes = [it.descPt?.trim(), it.descOriginal?.trim(), it.material?.trim(), it.uso?.trim()].filter(
    Boolean,
  ) as string[];
  return partes.join(" ");
}

function capBuscaItem(it: Item): string | undefined {
  const fam = detectarFamilia({ descOriginal: it.descOriginal, uso: it.uso ?? undefined });
  const cap = prefixoBuscaPrincipal(fam);
  return cap && /^\d{2,4}$/.test(cap) ? cap : undefined;
}

/** NCM + FOB/kg da planilha China para conciliação — busca por descrição do produto. */
export function resolverNcmConciliacaoPlanilhaChina(
  it: Item,
  planilhaItens: BenchmarkPlanilhaEntry[],
  benchmarkIndex?: BenchmarkIndex | null,
): PlanilhaChinaNcmHit | null {
  if (!planilhaItens.length) return null;

  const rowFromNcm = (ncm: string): PlanilhaChinaNcmHit | null => {
    const key = normalizarNcm(ncm);
    if (!key || key === "00000000") return null;
    const row = planilhaItens.find((r) => normalizarNcm(r.ncm) === key);
    const fobKg = row?.fobKgMedioDI ?? row?.fobKg ?? 0;
    if (!row || fobKg <= 0) return null;
    if (benchmarkIndex && !ncmNaPlanilhaChinaIndex(benchmarkIndex, key)) return null;
    return { ncm: key, desc: row.desc, fobKgMedioDI: fobKg, score: 1 };
  };

  // 1. Candidatos IA/classificação presentes na planilha China (identificação por produto).
  for (const c of it.ncmCandidatos ?? []) {
    const hit = rowFromNcm(c.ncm);
    if (hit) return hit;
  }

  // 2. Busca textual na planilha China pela descrição traduzida do produto.
  const cap = capBuscaItem(it);
  const texto = textoBuscaItem(it);
  const hits = buscarNcmPlanilhaChinaPorDescricao(texto, planilhaItens, { capitulo4: cap, limite: 8 });
  if (hits.length) return hits[0]!;

  // 3. NCM operacional do item, se existir na planilha China (ex.: confirmação humana).
  const op = rowFromNcm(it.ncm ?? "");
  if (op) return op;

  return null;
}
