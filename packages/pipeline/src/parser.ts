/**
 * Parser de planilha de fornecedor (.xlsx / .csv) — detecção heurística de colunas.
 */

import * as XLSX from "xlsx";
import type { LinhaCrua } from "./linha.js";

export type ColunaDetectada =
  | "descricao"
  | "qtd"
  | "peso"
  | "peso_bruto"
  | "preco"
  | "fob"
  | "ncm"
  | "dimensoes"
  | "desconhecido";

export interface ColunaMapeada {
  indice: number;
  header: string;
  tipo: ColunaDetectada;
  confianca: number;
}

export interface LinhaFornecedor {
  linha: number;
  descricao: string;
  qtd: number | null;
  pesoLiqKg: number | null;
  pesoBrutoKg: number | null;
  precoUnitario: number | null;
  fobTotalUS: number | null;
  ncm: string | null;
  raw: Record<string, unknown>;
}

export interface ResultadoParse {
  aba: string;
  headerRow: number;
  colunas: ColunaMapeada[];
  linhas: LinhaFornecedor[];
  avisos: string[];
}

const PADROES: { tipo: ColunaDetectada; re: RegExp }[] = [
  {
    tipo: "descricao",
    re: /desc|description|品名|货物|产品配置|配置|product\s*config|product|item\s*number|货号|nome|mercadoria/i,
  },
  { tipo: "qtd", re: /qty|quant|quantity|数量|装箱量|qtd|pcs|unidade/i },
  { tipo: "peso_bruto", re: /gross|bruto|毛重|gw\b/i },
  { tipo: "peso", re: /peso|weight|净重|nw\b|net|kg/i },
  { tipo: "fob", re: /fob|total.*usd|amount|valor.*us/i },
  { tipo: "preco", re: /price|preço|preco|unit|单价|usd\/kg/i },
  { tipo: "ncm", re: /ncm|hs\s*code|tariff|税号/i },
  { tipo: "dimensoes", re: /dim|size|规格|measure/i },
];

/** Ignora colunas de imagem/cor/tempo — não são itens. */
const COLUNA_IGNORAR = /产品图片|product\s*image|^\s*颜色|colour|color|使用时间|usage\s*time|充电时间|charging/i;

function detectarTipo(header: string): { tipo: ColunaDetectada; confianca: number } {
  const h = String(header).trim();
  if (!h) return { tipo: "desconhecido", confianca: 0 };
  for (const { tipo, re } of PADROES) {
    if (re.test(h)) return { tipo, confianca: 0.85 };
  }
  return { tipo: "desconhecido", confianca: 0 };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/,/g, ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function encontrarHeader(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(30, rows.length); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const textos = r.filter((c) => c !== null && String(c).trim() !== "").length;
    const temDesc = r.some((c) => detectarTipo(String(c ?? "")).tipo === "descricao");
    if (textos >= 3 && (temDesc || textos >= 5)) return i;
  }
  return 0;
}

/** Converte texto OCR (linhas) em matriz de células — tab, pipe ou espaços múltiplos. */
export function textoOcrParaLinhas(texto: string): unknown[][] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .map((linha) => {
      if (linha.includes("\t")) return linha.split("\t").map((c) => c.trim());
      if (linha.includes("|")) return linha.split("|").map((c) => c.trim());
      return linha.split(/\s{2,}/).map((c) => c.trim());
    });
}

function parseRows(
  rows: unknown[][],
  aba: string,
  avisosExtras: string[] = [],
): ResultadoParse {
  const avisos: string[] = [...avisosExtras];
  const headerRow = encontrarHeader(rows);
  const headerCells = (rows[headerRow] ?? []) as unknown[];

  const colunas: ColunaMapeada[] = headerCells.map((h, indice) => {
    const header = String(h ?? `Col${indice}`);
    if (COLUNA_IGNORAR.test(header)) {
      return { indice, header, tipo: "desconhecido" as ColunaDetectada, confianca: 0 };
    }
    const { tipo, confianca } = detectarTipo(header);
    return { indice, header, tipo, confianca };
  });

  const idx = (t: ColunaDetectada) => colunas.find((c) => c.tipo === t)?.indice;

  // Preferir 产品配置 sobre 货号 (SKU curto) quando ambos existem.
  const iDesc =
    colunas.find((c) => /产品配置|product\s*config/i.test(c.header))?.indice ??
    idx("descricao");
  const iSku = colunas.find((c) => /货号|item\s*number/i.test(c.header) && c.indice !== iDesc)?.indice;
  const iQtd = idx("qtd");
  const iPeso = idx("peso");
  const iPesoBruto = idx("peso_bruto");
  const iPreco = idx("preco");
  const iFob = idx("fob");
  const iNcm = idx("ncm");

  if (iDesc === undefined) {
    avisos.push("Coluna de descrição não detectada — revise o mapeamento manual.");
  }

  const linhas: LinhaFornecedor[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row) continue;

    const parteDesc = iDesc !== undefined ? String(row[iDesc] ?? "").trim() : "";
    const parteSku = iSku !== undefined ? String(row[iSku] ?? "").trim() : "";
    const descricao = [parteSku, parteDesc].filter(Boolean).join(" — ") || parteDesc || parteSku;
    if (!descricao || descricao.length < 2) continue;

    const qtd = iQtd !== undefined ? num(row[iQtd]) : null;
    const pesoLiqKg = iPeso !== undefined ? num(row[iPeso]) : null;
    const pesoBrutoKg = iPesoBruto !== undefined ? num(row[iPesoBruto]) : null;
    const precoUnitario = iPreco !== undefined ? num(row[iPreco]) : null;
    let fobTotalUS = iFob !== undefined ? num(row[iFob]) : null;
    if (fobTotalUS === null && precoUnitario !== null && qtd !== null) {
      fobTotalUS = precoUnitario * qtd;
    }
    const ncmRaw = iNcm !== undefined ? String(row[iNcm] ?? "").trim() : "";
    const ncm = ncmRaw ? ncmRaw.replace(/\D/g, "").padStart(8, "0").slice(0, 8) : null;

    const raw: Record<string, unknown> = {};
    colunas.forEach((c) => {
      raw[c.header] = row[c.indice];
    });

    linhas.push({
      linha: r + 1,
      descricao,
      qtd,
      pesoLiqKg,
      pesoBrutoKg,
      precoUnitario,
      fobTotalUS,
      ncm: ncm && ncm.length === 8 ? ncm : null,
      raw,
    });
  }

  if (linhas.length === 0) {
    avisos.push("Nenhuma linha de item encontrada após o cabeçalho.");
  }

  return { aba, headerRow, colunas, linhas, avisos };
}

export function parsePlanilhaBuffer(
  buffer: ArrayBuffer | Buffer,
  nomeAba?: string,
): ResultadoParse {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const aba = nomeAba && wb.SheetNames.includes(nomeAba) ? nomeAba : wb.SheetNames[0]!;
  const ws = wb.Sheets[aba]!;
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  return parseRows(rows, aba);
}

/** Texto extraído por OCR (PDF/imagem) → mesmo pipeline de colunas/linhas. */
export function parseOcrTexto(texto: string, origem = "OCR"): ResultadoParse {
  const rows = textoOcrParaLinhas(texto);
  const avisos = ["Origem: OCR — revise o mapeamento se necessário."];
  if (rows.length === 0) avisos.push("OCR não gerou linhas legíveis.");
  return parseRows(rows, origem, avisos);
}

function resultadoParaSupplier(parsed: ResultadoParse): ParsedSupplierFile {
  const mapeamento: Record<string, number> = {};
  for (const c of parsed.colunas) {
    if (c.tipo !== "desconhecido") mapeamento[c.tipo] = c.indice;
  }
  const linhas: LinhaCrua[] = parsed.linhas.map((l) => ({
    __row: l.linha,
    descOriginal: l.descricao,
    ncm: l.ncm,
    qtd: l.qtd,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobUnitarioUS: l.precoUnitario,
    fobTotalUS: l.fobTotalUS,
    dimensoes: null,
  }));
  return {
    abaUsada: parsed.aba,
    headerRowIndex: parsed.headerRow,
    colunas: parsed.colunas.map((c) => ({
      campo: c.tipo,
      colIndex: c.indice,
      header: c.header,
      confianca: c.confianca,
    })),
    mapeamento,
    linhas,
    totalLinhas: linhas.length,
    avisos: parsed.avisos,
  };
}

export interface ParsedSupplierFile {
  abaUsada: string;
  headerRowIndex: number;
  colunas: { campo: ColunaDetectada; colIndex: number; header: string; confianca: number }[];
  mapeamento: Record<string, number>;
  linhas: LinhaCrua[];
  totalLinhas: number;
  avisos: string[];
}

/** Planilha Excel/CSV (buffer do upload). */
export function parseSupplierFile(bytes: Uint8Array): ParsedSupplierFile {
  return resultadoParaSupplier(parsePlanilhaBuffer(Buffer.from(bytes)));
}

/** Texto OCR → estrutura de cotação. */
export function parseSupplierOcrText(texto: string, origem?: string): ParsedSupplierFile {
  return resultadoParaSupplier(parseOcrTexto(texto, origem));
}
