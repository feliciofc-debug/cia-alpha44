/**
 * Cliente da API ComexStat (MDIC) — FOB/kg por NCM.
 * https://api-comexstat.mdic.gov.br/general
 */

import { writeFileSync } from "node:fs";
import type { ComexSeed, ComexStatEntry } from "./benchmark.js";
import { defaultSeedPath, loadComexSeed } from "./seed.js";
import { normalizarNcm } from "./benchmark.js";
import { filtrosUltimosMesesFechados, periodoLabel } from "./benchmark-metrics.js";

const API_URL = "https://api-comexstat.mdic.gov.br/general";

export interface ComexStatFiltros {
  paisId: number;
  viaId: string;
  periodoDe: string;
  periodoAte: string;
}

export const COMEXSTAT_CHINA_MARITIMO_2023S1: ComexStatFiltros = {
  paisId: 160,
  viaId: "01",
  periodoDe: "2023-01",
  periodoAte: "2023-06",
};

export interface ComexStatApiRow {
  coNcm: string;
  ncm?: string;
  metricFOB?: string | number;
  metricKG?: string | number;
  metricCIF?: string | number;
}

interface ComexStatApiResponse {
  success?: boolean;
  data?: ComexStatApiRow[] | { list?: ComexStatApiRow[] };
  error?: { message?: string };
}

function num(v: string | number | undefined): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function contextoDe(f: ComexStatFiltros): string {
  const periodo = periodoLabel(f.periodoDe, f.periodoAte);
  if (/^\d{4}-S[12]$/.test(periodo)) {
    const sem = periodo.endsWith("S1") ? "1º semestre" : "2º semestre";
    return `${sem} ${periodo.slice(0, 4)} · China (país ${f.paisId}) · via marítima`;
  }
  return `${f.periodoDe} a ${f.periodoAte} · China (país ${f.paisId}) · via marítima`;
}

export { filtrosUltimosMesesFechados, periodoLabel };

/** Converte linhas da API em entradas de benchmark (FOB/kg e CIF/kg). */
export function comexRowsParaEntradas(rows: ComexStatApiRow[]): ComexStatEntry[] {
  const out: ComexStatEntry[] = [];
  for (const row of rows) {
    const ncm = normalizarNcm(row.coNcm ?? "");
    if (ncm.length !== 8 || ncm === "00000000") continue;
    const kg = num(row.metricKG);
    const fob = num(row.metricFOB);
    if (kg <= 0 || fob <= 0) continue;
    const cif = num(row.metricCIF);
    out.push({
      ncm,
      desc: String(row.ncm ?? "").slice(0, 120),
      fobKg: Number((fob / kg).toFixed(6)),
      cifKg: cif > 0 ? Number((cif / kg).toFixed(6)) : Number((fob / kg).toFixed(6)),
      amostra: 1,
    });
  }
  out.sort((a, b) => a.ncm.localeCompare(b.ncm));
  return out;
}

/** Consulta importação agregada por NCM na API ComexStat. */
export async function fetchComexStatImport(
  filtros: ComexStatFiltros = COMEXSTAT_CHINA_MARITIMO_2023S1,
): Promise<ComexStatEntry[]> {
  const body = {
    flow: "import",
    period: { from: filtros.periodoDe, to: filtros.periodoAte },
    filters: [
      { filter: "country", values: [filtros.paisId] },
      { filter: "via", values: [filtros.viaId] },
    ],
    details: ["ncm"],
    metrics: ["metricFOB", "metricKG", "metricCIF"],
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`ComexStat HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  const json = (await res.json()) as ComexStatApiResponse;
  const raw = json.data;
  const list = Array.isArray(raw) ? raw : raw?.list;
  if (!list?.length) {
    throw new Error(json.error?.message ?? "ComexStat retornou lista vazia");
  }
  return comexRowsParaEntradas(list);
}

/** Monta objeto de seed pronto para gravar em JSON. */
export function buildComexSeed(
  itens: ComexStatEntry[],
  filtros: ComexStatFiltros = COMEXSTAT_CHINA_MARITIMO_2023S1,
): ComexSeed {
  return {
    fonte: "ComexStat",
    contexto: contextoDe(filtros),
    geradoEm: new Date().toISOString(),
    total: itens.length,
    itens,
    periodoDe: filtros.periodoDe,
    periodoAte: filtros.periodoAte,
    periodoReferencia: periodoLabel(filtros.periodoDe, filtros.periodoAte),
  };
}

/** Busca na API e grava o seed JSON (padrão: comexstat-china-2023s1.json). */
export async function fetchComexStatSeed(
  outPath = defaultSeedPath(),
  filtros: ComexStatFiltros = COMEXSTAT_CHINA_MARITIMO_2023S1,
): Promise<ComexSeed> {
  const itens = await fetchComexStatImport(filtros);
  const data = buildComexSeed(itens, filtros);
  writeFileSync(outPath, JSON.stringify(data), "utf8");
  return data;
}

/** FOB/kg de um NCM — cache local primeiro; se ausente, consulta API agregada e filtra. */
export async function fetchComexStatFobKg(
  ncm: string,
  filtros: ComexStatFiltros = COMEXSTAT_CHINA_MARITIMO_2023S1,
): Promise<ComexStatEntry | null> {
  const key = normalizarNcm(ncm);
  if (key.length !== 8 || key === "00000000") return null;

  try {
    const cached = loadComexSeed().itens.find((e) => e.ncm === key);
    if (cached) return cached;
  } catch {
    /* seed ainda não gerado */
  }

  const all = await fetchComexStatImport(filtros);
  return all.find((e) => e.ncm === key) ?? null;
}
