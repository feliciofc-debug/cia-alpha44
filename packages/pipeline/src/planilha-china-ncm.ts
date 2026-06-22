/**
 * NCM + FOB/kg da planilha operacional IMPORTAÇÕES DA CHINA — uso Camada B (valoração)
 * e lookup FOB/kg na conciliação. NÃO é classificador Camada A (ver planilha-cliente-ncm.ts).
 */

import type { Item } from "@cia/shared";
import type { BenchmarkPlanilhaEntry } from "./benchmark-planilha.js";
import { defaultBenchmarkPlanilhaPath, loadBenchmarkPlanilha } from "./benchmark-historico-store.js";
import { normalizarNcm, type BenchmarkIndex } from "./benchmark.js";
import {
  detectarFamilia,
  detectarFamilias,
  ncmCoerenteComFamilia,
  prefixosDasFamilias,
  textoDeteccaoFamilia,
  type FamiliaProduto,
} from "./classificar-ncm.js";
import type { LinhaCrua } from "./linha.js";
import type { NcmCatalog } from "./ncm-catalog.js";
import { ncmNaPlanilhaChinaIndex } from "./planilha-china-fob.js";
import { tokenCorOuAcabamento, tokensProdutoSemCor } from "./tokens-cor-produto.js";

export interface PlanilhaChinaNcmHit {
  ncm: string;
  desc: string;
  fobKgMedioDI: number;
  score: number;
}

export const MIN_SCORE_BUSCA_PLANILHA_CHINA = 0.12;

/** FOB/kg acima disto exige score alto — evita lixador→191 USD/kg por match fraco. */
const FOB_KG_MAX_MATCH_FRACO = 25;
const SCORE_MIN_FOB_ALTO = 0.65;

/** Capítulos que só batem por cor — rejeitar quando família não é tinta/cosmético. */
const CAPITULOS_COR_LIXO = new Set(["3208", "3209", "3210", "3211", "3212", "3213", "3214", "3215"]);

function tokensTexto(texto: string): string[] {
  return tokensProdutoSemCor(texto);
}

/** Sinônimos operacionais — produto na invoice → tokens que existem na planilha China. */
function expandirTokensProduto(queryTokens: string[], familia: FamiliaProduto | null): string[] {
  const out = new Set(queryTokens);
  const joined = queryTokens.join(" ");
  if (familia?.id === "eletrodomesticos") {
    if (/pipoqueir|popcorn|pipoca|air\s*fry|airfry|fritadeir/i.test(joined)) {
      out.add("panela");
      out.add("eletrot");
    }
  }
  if (familia?.id === "eletro_portatil") {
    if (/aspir|vacuum/i.test(joined)) {
      out.add("aspirador");
      out.add("aspir");
    }
  }
  return [...out];
}

function tokenCombina(query: string, desc: string): boolean {
  if (query === desc) return true;
  const min = 4;
  if (query.length >= min && desc.startsWith(query)) return true;
  if (desc.length >= min && query.startsWith(desc)) return true;
  return false;
}

function tokensDescricaoPlanilha(desc: string): string[] {
  return desc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
}

function pontuarDescricao(
  queryTokens: string[],
  desc: string,
  familia: FamiliaProduto | null,
): { score: number; tokensCasados: number; matchSoCor: boolean; queryTokensCasados: number } {
  const tokensDesc = tokensDescricaoPlanilha(desc);
  if (!queryTokens.length && !familia) return { score: 0, tokensCasados: 0, matchSoCor: true, queryTokensCasados: 0 };

  let pontos = 0;
  let tokensCasados = 0;
  let queryTokensCasados = 0;
  for (const t of queryTokens) {
    if (tokensDesc.some((d) => tokenCombina(t, d))) {
      pontos += 2;
      tokensCasados++;
      queryTokensCasados++;
    }
  }

  if (familia) {
    for (const ft of tokensProdutoSemCor(familia.termosBusca)) {
      if (tokensDesc.some((d) => tokenCombina(ft, d))) {
        pontos += 3;
        tokensCasados++;
      }
    }
    for (const pref of familia.ncmPreferidos ?? []) {
      if (desc.includes(pref)) pontos += 1;
    }
  }

  const denom = queryTokens.length * 2 + (familia ? 6 : 0);
  const score = denom > 0 ? pontos / denom : 0;
  const matchSoCor = queryTokensCasados === 0;
  return { score, tokensCasados, matchSoCor, queryTokensCasados };
}

function capitulosBuscaFamilia(familia: FamiliaProduto | null): string[] {
  if (!familia) return [];
  return prefixosDasFamilias([familia]).filter((p) => p.length === 4);
}

function capitulosBuscaInput(
  input: Pick<LinhaCrua, "descOriginal" | "uso"> | Pick<Item, "descOriginal" | "descPt" | "uso">,
): string[] {
  const descOriginal =
    "descPt" in input && input.descPt
      ? textoDeteccaoFamilia(input.descOriginal ?? "", input.descPt)
      : (input.descOriginal ?? "");
  const { familias } = detectarFamilias({ descOriginal, uso: input.uso ?? undefined });
  if (!familias.length) return [];
  return prefixosDasFamilias(familias.map((f) => f.familia)).filter((p) => p.length === 4);
}

/** Família única ou a mais específica quando há conflito (ex.: secadora > roupa). */
function familiaPrimariaBusca(
  input: Pick<LinhaCrua, "descOriginal" | "uso"> | Pick<Item, "descOriginal" | "descPt" | "uso">,
): FamiliaProduto | null {
  const descOriginal =
    "descPt" in input && input.descPt
      ? textoDeteccaoFamilia(input.descOriginal ?? "", input.descPt)
      : (input.descOriginal ?? "");
  const { familias, conflito } = detectarFamilias({ descOriginal, uso: input.uso ?? undefined });
  if (familias.length === 1) return familias[0]!.familia;
  if (!conflito || !familias.length) return null;
  const preferencia = [
    "lavanderia_domestica",
    "ferramentas_eletricas",
    "eletro_portatil",
    "balancas_pesagem",
    "eletrodomesticos",
    "medico",
    "optica_lupa",
    "telefonia",
  ];
  for (const id of preferencia) {
    const hit = familias.find((f) => f.familia.id === id);
    if (hit) return hit.familia;
  }
  return familias[0]!.familia;
}

function hitRejeitadoPorFamilia(
  ncm: string,
  desc: string,
  familia: FamiliaProduto | null,
  matchSoCor: boolean,
): boolean {
  if (matchSoCor) return true;
  if (familia && !ncmCoerenteComFamilia(ncm, familia)) return true;
  if (
    familia &&
    familia.id !== "cosmeticos" &&
    CAPITULOS_COR_LIXO.has(ncm.slice(0, 4)) &&
    matchSoCor === false
  ) {
    const tokensDesc = tokensDescricaoPlanilha(desc);
    const soCorNaDesc = tokensDesc.some((t) => tokenCorOuAcabamento(t));
    const produtoNaDesc = tokensDesc.some((t) => !tokenCorOuAcabamento(t) && tokensProdutoSemCor(t).length > 0);
    if (soCorNaDesc && !produtoNaDesc) return true;
  }
  if (
    familia &&
    !["cosmeticos", "sabonetes"].includes(familia.id) &&
    CAPITULOS_COR_LIXO.has(ncm.slice(0, 4))
  ) {
    return true;
  }
  return false;
}

/** Busca textual na planilha China — família + produto; ignora cor. */
export function buscarNcmPlanilhaChinaPorDescricao(
  texto: string,
  itens: BenchmarkPlanilhaEntry[],
  opts?: {
    capitulo4?: string;
    capitulos4?: string[];
    familia?: FamiliaProduto | null;
    limite?: number;
    minScore?: number;
  },
): PlanilhaChinaNcmHit[] {
  const familiaDetectada = opts?.familia ?? detectarFamilia({ descOriginal: texto });
  const capsAspirador =
    familiaDetectada?.id === "eletro_portatil" && /\baspir|vacuum/i.test(texto)
      ? ["8508"]
      : null;
  const caps =
    opts?.capitulos4?.length
      ? opts.capitulos4
      : capsAspirador?.length
        ? capsAspirador
        : opts?.capitulo4
          ? [opts.capitulo4.replace(/\D/g, "").slice(0, 4)]
          : capitulosBuscaFamilia(familiaDetectada);

  const queryTokens = tokensTexto(texto);
  const familia = familiaDetectada;
  if (!queryTokens.length && !familia) return [];

  const minScore = opts?.minScore ?? MIN_SCORE_BUSCA_PLANILHA_CHINA;
  const scored: PlanilhaChinaNcmHit[] = [];
  const preferidos = new Set(familia?.ncmPreferidos?.map((n) => normalizarNcm(n)) ?? []);
  const queryTokensExpandidos = expandirTokensProduto(queryTokens, familia);

  for (const row of itens) {
    const ncm = normalizarNcm(row.ncm);
    if (!ncm || ncm === "00000000") continue;
    if (caps.length && !caps.some((c) => ncm.startsWith(c))) continue;
    const fobKg = row.fobKgMedioDI ?? row.fobKg ?? 0;
    if (fobKg <= 0) continue;

    const { score, tokensCasados, matchSoCor, queryTokensCasados } = pontuarDescricao(
      queryTokensExpandidos,
      row.desc,
      familia,
    );
    if (score < minScore || tokensCasados === 0 || queryTokensCasados === 0) continue;
    if (hitRejeitadoPorFamilia(ncm, row.desc, familia, matchSoCor)) continue;

    const boost = preferidos.has(ncm) ? 0.15 : 0;
    const scoreFinal = score + boost;
    if (fobKg > FOB_KG_MAX_MATCH_FRACO && scoreFinal < SCORE_MIN_FOB_ALTO) continue;

    scored.push({ ncm, desc: row.desc, fobKgMedioDI: fobKg, score: scoreFinal });
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

function familiaBuscaItem(it: Pick<Item, "descOriginal" | "descPt" | "uso">): FamiliaProduto | null {
  return familiaPrimariaBusca(it);
}

function familiaBuscaLinha(l: Pick<LinhaCrua, "descOriginal" | "uso">): FamiliaProduto | null {
  return familiaPrimariaBusca(l);
}

/** Linhas carregadas da planilha IMPORTAÇÕES DA CHINA NOVO (memória/disco). */
export function carregarItensPlanilhaChinaOperacional(): BenchmarkPlanilhaEntry[] {
  const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
  return seed?.itens ?? [];
}

function hitFromNcmColuna(
  ncm: string | null | undefined,
  planilhaItens: BenchmarkPlanilhaEntry[],
  benchmarkIndex?: BenchmarkIndex | null,
  familia?: FamiliaProduto | null,
): PlanilhaChinaNcmHit | null {
  const key = normalizarNcm(ncm ?? "");
  if (!key || key === "00000000") return null;
  if (familia && !ncmCoerenteComFamilia(key, familia)) return null;
  const row = planilhaItens.find((r) => normalizarNcm(r.ncm) === key);
  const fobKg = row?.fobKgMedioDI ?? row?.fobKg ?? 0;
  if (!row || fobKg <= 0) return null;
  if (benchmarkIndex && !ncmNaPlanilhaChinaIndex(benchmarkIndex, key)) return null;
  return { ncm: key, desc: row.desc, fobKgMedioDI: fobKg, score: 1 };
}

/**
 * Lookup FOB/kg por descrição — só conciliação/valoração (não Camada A).
 * 1) NCM coluna embarque se existir na planilha China e coerente com família
 * 2) Busca textual por descrição/material/uso (família prevalece; cor ignorada)
 */
export function resolverNcmClassificacaoPlanilhaChina(
  l: Pick<LinhaCrua, "descOriginal" | "ncm" | "material" | "uso">,
  planilhaItens: BenchmarkPlanilhaEntry[],
  benchmarkIndex?: BenchmarkIndex | null,
  catalog?: NcmCatalog | null,
): PlanilhaChinaNcmHit | null {
  if (!planilhaItens.length) return null;

  const familia = familiaBuscaLinha(l);

  const aceita = (hit: PlanilhaChinaNcmHit | null): PlanilhaChinaNcmHit | null => {
    if (!hit) return null;
    if (catalog && !catalog.existe(hit.ncm)) return null;
    if (familia && !ncmCoerenteComFamilia(hit.ncm, familia)) return null;
    return hit;
  };

  const porColuna = aceita(hitFromNcmColuna(l.ncm, planilhaItens, benchmarkIndex, familia));
  if (porColuna) return porColuna;

  const texto = [l.descOriginal?.trim(), l.material?.trim(), l.uso?.trim()].filter(Boolean).join(" ");
  const familiaLinha = familiaBuscaLinha(l);
  const capsAspirador =
    familiaLinha?.id === "eletro_portatil" && /\baspir|vacuum/i.test(texto) ? ["8508"] : null;
  const capsInput = capitulosBuscaInput(l);
  const caps = capsAspirador?.length ? capsAspirador : capsInput;
  const hits = buscarNcmPlanilhaChinaPorDescricao(texto, planilhaItens, {
    capitulos4: caps.length ? caps : undefined,
    familia,
    limite: 5,
  });
  return aceita(hits[0] ?? null);
}

/** NCM + FOB/kg da planilha China para conciliação — busca por descrição do produto. */
export function resolverNcmConciliacaoPlanilhaChina(
  it: Item,
  planilhaItens: BenchmarkPlanilhaEntry[],
  benchmarkIndex?: BenchmarkIndex | null,
): PlanilhaChinaNcmHit | null {
  if (!planilhaItens.length) return null;

  const familia = familiaBuscaItem(it);

  const rowFromNcm = (ncm: string): PlanilhaChinaNcmHit | null =>
    hitFromNcmColuna(ncm, planilhaItens, benchmarkIndex, familia);

  if (it.ncmClassificacaoCache === "humano" || it.ncmRevisadoHumano) {
    const hit = rowFromNcm(it.ncm ?? "");
    if (hit) return hit;
  }

  const caps = capitulosBuscaInput(it);
  const texto = textoBuscaItem(it);
  const hits = buscarNcmPlanilhaChinaPorDescricao(texto, planilhaItens, {
    capitulos4: caps.length ? caps : undefined,
    familia,
    limite: 8,
  });
  if (hits.length) {
    const candidatos = new Set((it.ncmCandidatos ?? []).map((c) => normalizarNcm(c.ncm)));
    const boost = hits.find((h) => candidatos.has(h.ncm));
    if (boost) return boost;
    return hits[0]!;
  }

  for (const c of it.ncmCandidatos ?? []) {
    const hit = rowFromNcm(c.ncm);
    if (hit) return hit;
  }

  const op = rowFromNcm(it.ncm ?? "");
  if (op) return op;

  return null;
}
