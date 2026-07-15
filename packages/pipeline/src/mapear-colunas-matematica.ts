/**
 * Mapeamento determinístico de colunas por validação matemática (planilhas sem cabeçalho).
 * Prevalece sobre palpite da IA quando unitário×qtd ≈ total (±1%) em ≥80% das linhas.
 */

import type { ColunaDetectada, ColunaMapeada } from "./parser.js";
import type { MapeamentoColunasIA } from "./parser-sinonimos.js";
import { RE_QTD_CAIXAS_MULTILINGUE } from "./parser-sinonimos.js";

const TOLERANCIA = 0.01;
const MIN_LINHAS = 3;
const MIN_TAXA_MATCH = 0.8;

export interface MapeamentoMatematico extends MapeamentoColunasIA {
  qtdCaixas?: number;
  qtdPorCaixa?: number;
  pesoBrutoTotal?: number;
  pesoLiqTotal?: number;
  headersSinteticos: Record<number, string>;
  semCabecalho: boolean;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function relDiff(a: number, b: number): number {
  const base = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / base;
}

function matchMultiplica(
  rows: unknown[][],
  colA: number,
  colB: number,
  colC: number,
): { matches: number; total: number } {
  let matches = 0;
  let total = 0;
  for (const row of rows) {
    const a = num(row[colA]);
    const b = num(row[colB]);
    const c = num(row[colC]);
    if (a == null || b == null || c == null || a <= 0 || b <= 0 || c <= 0) continue;
    total++;
    if (relDiff(a * b, c) <= TOLERANCIA) matches++;
  }
  return { matches, total };
}

function taxaOk(stats: { matches: number; total: number }): boolean {
  return stats.total >= MIN_LINHAS && stats.matches / stats.total >= MIN_TAXA_MATCH;
}

function melhorParProduto(
  rows: unknown[][],
  numCols: number,
): { a: number; b: number; c: number; score: number } | null {
  let best: { a: number; b: number; c: number; score: number } | null = null;
  for (let a = 0; a < numCols; a++) {
    for (let b = 0; b < numCols; b++) {
      if (b === a) continue;
      for (let c = 0; c < numCols; c++) {
        if (c === a || c === b) continue;
        const stats = matchMultiplica(rows, a, b, c);
        if (!taxaOk(stats)) continue;
        const score = stats.matches / stats.total;
        if (!best || score > best.score) best = { a, b, c, score };
      }
    }
  }
  return best;
}

function melhorParPreco(
  rows: unknown[][],
  colQtd: number,
  numCols: number,
): { unit: number; total: number; score: number } | null {
  let best: { unit: number; total: number; score: number } | null = null;
  for (let unit = 0; unit < numCols; unit++) {
    if (unit === colQtd) continue;
    for (let total = 0; total < numCols; total++) {
      if (total === colQtd || total === unit) continue;
      let matches = 0;
      let n = 0;
      for (const row of rows) {
        const u = num(row[unit]);
        const q = num(row[colQtd]);
        const t = num(row[total]);
        if (u == null || q == null || t == null || u <= 0 || q <= 0 || t <= 0) continue;
        n++;
        if (relDiff(u * q, t) <= TOLERANCIA) matches++;
      }
      if (n < MIN_LINHAS || matches / n < MIN_TAXA_MATCH) continue;
      const score = matches / n;
      if (!best || score > best.score) best = { unit, total, score };
    }
  }
  return best;
}

function melhorParPeso(
  rows: unknown[][],
  colCaixas: number,
  numCols: number,
  usados: Set<number>,
): { unit: number; total: number; score: number } | null {
  let best: { unit: number; total: number; score: number } | null = null;
  for (let unit = 0; unit < numCols; unit++) {
    if (usados.has(unit) || unit === colCaixas) continue;
    for (let total = 0; total < numCols; total++) {
      if (usados.has(total) || total === colCaixas || total === unit) continue;
      const stats = matchMultiplica(rows, unit, colCaixas, total);
      if (!taxaOk(stats)) continue;
      const score = stats.matches / stats.total;
      if (!best || score > best.score) best = { unit, total, score };
    }
  }
  return best;
}

function colunaTextoDominante(rows: unknown[][], exclude: Set<number>): number | undefined {
  const scores = new Map<number, number>();
  for (const row of rows) {
    for (let c = 0; c < row.length; c++) {
      if (exclude.has(c)) continue;
      const raw = String(row[c] ?? "").trim();
      if (!raw || num(raw) != null) continue;
      if (/[\u4e00-\u9fff]/.test(raw) || raw.length >= 8) {
        scores.set(c, (scores.get(c) ?? 0) + 1);
      }
    }
  }
  let best: { c: number; n: number } | undefined;
  for (const [c, n] of scores) {
    if (!best || n > best.n) best = { c, n };
  }
  return best && best.n >= MIN_LINHAS ? best.c : undefined;
}

/** Planilha sem linha de cabeçalho — primeira linha já é item. */
export function planilhaProvavelmenteSemCabecalho(rows: unknown[][], headerRow: number): boolean {
  const header = rows[headerRow] ?? [];
  const first = String(header[0] ?? "").trim();
  if (/^[A-Z]{1,4}[\w-]+$/i.test(first)) return true;
  const textCells = header.filter((c) => {
    const s = String(c ?? "").trim();
    return s && num(s) == null;
  });
  const numCells = header.filter((c) => num(c) != null && num(c)! > 0);
  return textCells.length <= 2 && numCells.length >= 4;
}

export function inferirMapeamentoColunasPorMatematica(
  rows: unknown[][],
  headerRow: number,
  semCabecalho?: boolean,
): MapeamentoMatematico | null {
  const ehSemCabecalho = semCabecalho ?? planilhaProvavelmenteSemCabecalho(rows, headerRow);
  const dataRows = rows.slice(ehSemCabecalho ? headerRow : headerRow + 1).filter((r) => {
    if (!r?.length) return false;
    return r.some((c) => c != null && String(c).trim() !== "");
  });
  if (dataRows.length < MIN_LINHAS) return null;

  const numCols = Math.max(...dataRows.map((r) => r.length));
  const qtdPar = melhorParProduto(dataRows, numCols);
  if (!qtdPar) return null;

  const precoPar = melhorParPreco(dataRows, qtdPar.c, numCols);
  if (!precoPar) return null;

  const usados = new Set([qtdPar.a, qtdPar.b, qtdPar.c, precoPar.unit, precoPar.total]);
  const pesoBrutoPar = melhorParPeso(dataRows, qtdPar.a, numCols, usados);
  if (pesoBrutoPar) {
    usados.add(pesoBrutoPar.unit);
    usados.add(pesoBrutoPar.total);
  }
  const pesoLiqPar = melhorParPeso(dataRows, qtdPar.a, numCols, usados);

  const iDesc = colunaTextoDominante(dataRows, usados);

  const headersSinteticos: Record<number, string> = {
    [qtdPar.a]: "件数",
    [qtdPar.b]: "每箱数量",
    [qtdPar.c]: "总数量",
    [precoPar.unit]: "单价",
    [precoPar.total]: "总价",
  };
  if (pesoBrutoPar) {
    headersSinteticos[pesoBrutoPar.unit] = "毛重";
    headersSinteticos[pesoBrutoPar.total] = "总毛重";
  }
  if (pesoLiqPar) {
    headersSinteticos[pesoLiqPar.unit] = "净重";
    headersSinteticos[pesoLiqPar.total] = "总净重";
  }
  if (iDesc != null) headersSinteticos[iDesc] = "货物名称";

  const mapa: MapeamentoMatematico = {
    descricao: iDesc,
    qtd: qtdPar.c,
    preco: precoPar.unit,
    fob: precoPar.total,
    qtdCaixas: qtdPar.a,
    qtdPorCaixa: qtdPar.b,
    pesoBrutoTotal: pesoBrutoPar?.total,
    pesoLiqTotal: pesoLiqPar?.total,
    headersSinteticos,
    semCabecalho: ehSemCabecalho,
  };

  if (pesoBrutoPar) mapa.peso_bruto = pesoBrutoPar.unit;
  if (pesoLiqPar) mapa.peso = pesoLiqPar.unit;

  return mapa;
}

export function mesclarMapeamentoMatematicaPrevalece(
  ia: MapeamentoColunasIA | null | undefined,
  math: MapeamentoMatematico | null,
): MapeamentoMatematico | null {
  if (!math) return null;
  if (!ia) return math;
  const camposMatematicos: ColunaDetectada[] = [
    "descricao",
    "qtd",
    "preco",
    "fob",
    "peso",
    "peso_bruto",
  ];
  const out: MapeamentoMatematico = {
    ...math,
    headersSinteticos: { ...math.headersSinteticos },
    semCabecalho: math.semCabecalho,
  };
  for (const campo of camposMatematicos) {
    const idxMath = math[campo];
    if (idxMath != null) out[campo] = idxMath;
    else if (ia[campo] != null) out[campo] = ia[campo];
  }
  for (const [campo, idx] of Object.entries(ia) as [ColunaDetectada, number | undefined][]) {
    if (out[campo] == null && idx != null) out[campo] = idx;
  }
  return out;
}

export function colunasFromMapeamentoMatematico(
  numColunas: number,
  mapa: MapeamentoMatematico,
): ColunaMapeada[] {
  const colunas: ColunaMapeada[] = [];
  for (let indice = 0; indice < numColunas; indice++) {
    const header = mapa.headersSinteticos[indice] ?? `Col${indice}`;
    let tipo: ColunaDetectada = "desconhecido";
    let confianca = 0;
    for (const [campo, idx] of Object.entries(mapa)) {
      if (idx !== indice) continue;
      if (
        campo === "headersSinteticos" ||
        campo === "semCabecalho" ||
        campo === "qtdCaixas" ||
        campo === "qtdPorCaixa" ||
        campo === "pesoBrutoTotal" ||
        campo === "pesoLiqTotal"
      ) {
        continue;
      }
      tipo = campo as ColunaDetectada;
      confianca = 0.95;
    }
    if (indice === mapa.pesoBrutoTotal) {
      tipo = "peso_bruto";
      confianca = 0.94;
    } else if (indice === mapa.pesoLiqTotal) {
      tipo = "peso";
      confianca = 0.94;
    }
    colunas.push({ indice, header: mapa.headersSinteticos[indice] ?? header, tipo, confianca });
  }
  return colunas;
}

const RE_PESO_TOTAL_HEADER = /总毛重|总净重|总重|total.*weight|peso\s*total/i;
const RE_HEADER_NAO_PESO = /数量|qty|quant|单价|总价|price|amount|件数|每箱|体积|总体积|dim|size/i;

function colunasCandidatasPeso(colunas: ColunaMapeada[]): number[] {
  return colunas
    .filter((c) => {
      const h = c.header.replace(/\s+/g, " ");
      if (c.tipo === "qtd" || c.tipo === "preco" || c.tipo === "fob" || c.tipo === "descricao") return false;
      if (RE_HEADER_NAO_PESO.test(h)) return false;
      if (c.tipo === "peso_bruto" || c.tipo === "peso") return true;
      if (c.tipo === "desconhecido" && /重|weight|peso|gross|net/i.test(h)) return true;
      return false;
    })
    .map((c) => c.indice);
}

function melhorParPesoEntre(
  rows: unknown[][],
  colCaixas: number,
  candidatos: number[],
): { unit: number; total: number; score: number } | null {
  let best: { unit: number; total: number; score: number } | null = null;
  for (const unit of candidatos) {
    if (unit === colCaixas) continue;
    for (const total of candidatos) {
      if (total === colCaixas || total === unit) continue;
      const stats = matchMultiplica(rows, unit, colCaixas, total);
      if (!taxaOk(stats)) continue;
      const score = stats.matches / stats.total;
      if (!best || score > best.score) best = { unit, total, score };
    }
  }
  return best;
}

function semanticaPesoBrutoJaResolvida(colunas: ColunaMapeada[]): boolean {
  const brutos = colunas.filter((c) => c.tipo === "peso_bruto");
  const temUnit = brutos.some(
    (c) => /毛重|gross|gw\b|brutt/i.test(c.header) && !RE_PESO_TOTAL_HEADER.test(c.header),
  );
  const temTotal = brutos.some((c) => RE_PESO_TOTAL_HEADER.test(c.header));
  return temUnit && temTotal;
}

function indiceColunaCaixas(colunas: ColunaMapeada[]): number | undefined {
  const porHeader = colunas.find((c) => RE_QTD_CAIXAS_MULTILINGUE.test(c.header.replace(/\s+/g, " ")));
  return porHeader?.indice;
}

function linhasDadosComCabecalho(rows: unknown[][], headerRow: number): unknown[][] {
  return rows.slice(headerRow + 1).filter((r) => {
    if (!r?.length) return false;
    return r.some((c) => c != null && String(c).trim() !== "");
  });
}

export interface AjustePesoMatematico {
  colunas: ColunaMapeada[];
  /** 毛重 × caixas ≈ total detectado — não multiplicar peso/caixa por peças. */
  pesoUnitarioPorCaixa: boolean;
}

/**
 * Planilhas com cabeçalho: se colUnit × caixas ≈ colTotal (±1%, ≥80% linhas),
 * confirma colUnit = peso/caixa e colTotal = peso total da linha.
 */
export function ajustarColunasPesoPorMatematica(
  colunas: ColunaMapeada[],
  rows: unknown[][],
  headerRow: number,
): AjustePesoMatematico {
  const colCaixas = indiceColunaCaixas(colunas);
  if (colCaixas == null) return { colunas, pesoUnitarioPorCaixa: false };

  if (semanticaPesoBrutoJaResolvida(colunas)) {
    return { colunas, pesoUnitarioPorCaixa: true };
  }

  const dataRows = linhasDadosComCabecalho(rows, headerRow);
  if (dataRows.length < MIN_LINHAS) return { colunas, pesoUnitarioPorCaixa: false };

  const candidatos = colunasCandidatasPeso(colunas);
  if (candidatos.length < 2) return { colunas, pesoUnitarioPorCaixa: false };

  const pesoBrutoPar = melhorParPesoEntre(dataRows, colCaixas, candidatos);
  if (!pesoBrutoPar) return { colunas, pesoUnitarioPorCaixa: false };

  const out = colunas.map((c) => ({ ...c }));
  const marcar = (idx: number, tipo: ColunaDetectada) => {
    const atual = out[idx];
    if (!atual) return;
    out[idx] = { ...atual, tipo, confianca: Math.max(atual.confianca, 0.93) };
  };

  marcar(pesoBrutoPar.unit, "peso_bruto");
  marcar(pesoBrutoPar.total, "peso_bruto");

  return { colunas: out, pesoUnitarioPorCaixa: true };
}
