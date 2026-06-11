/**
 * Parser de planilha de fornecedor (.xlsx / .csv) — detecção heurística de colunas.
 */

import * as XLSX from "xlsx";
import type { LinhaCrua } from "./linha.js";
import { calcularPesosTotaisLinha } from "./peso-total-linha.js";
import { associarFotosLinhas, extrairFotosXlsx, type FotoPlanilha } from "./xlsx-images.js";
import { extrairImagensWpsOle, isOleXls, isZipXlsx, mapDispimgLinhas } from "./wps-images.js";

export type ColunaDetectada =
  | "descricao"
  | "qtd"
  | "peso"
  | "peso_bruto"
  | "preco"
  | "fob"
  | "fob_kg"
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
  qtdCaixas?: number | null;
  qtdPorCaixa?: number | null;
  pesoLiqKg: number | null;
  pesoBrutoKg: number | null;
  precoUnitario: number | null;
  fobTotalUS: number | null;
  ncm: string | null;
  material?: string | null;
  uso?: string | null;
  raw: Record<string, unknown>;
  fotoBase64?: string;
  fotoMime?: string;
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
    re: /desc|description|品名|货物|产品配置|配置|product\s*config|product|item\s*number|货号|nome|mercadoria|中文品名|英文品名/i,
  },
  { tipo: "qtd", re: /qty|quant|quantity|数量|总数量|pcs|qtd\b|unidade/i },
  { tipo: "peso_bruto", re: /gross|bruto|毛重|gw\b/i },
  { tipo: "peso", re: /peso|weight|净重|nw\b|net|kg/i },
  { tipo: "fob", re: /fob|total.*usd|amount|valor.*us|总价/i },
  { tipo: "preco", re: /price|preço|preco|unit|单价|usd\/kg/i },
  { tipo: "ncm", re: /ncm|hs\s*code|tariff|税号|海关编码/i },
  { tipo: "dimensoes", re: /dim|size|规格|measure/i },
];

/** Ignora colunas de imagem/cor/tempo — não são itens. */
const COLUNA_IGNORAR = /产品图片|product\s*image|^\s*颜色|colour|color|使用时间|usage\s*time|充电时间|charging/i;

function detectarTipo(header: string): { tipo: ColunaDetectada; confianca: number } {
  const h = String(header).trim();
  if (!h) return { tipo: "desconhecido", confianca: 0 };
  // "VALOR TOTAL FOB / KG" na planilha chinesa é valor total em US$, não preço por kg.
  if (/total.*fob|fob.*total|valor\s*total\s*fob|fob\s*total/i.test(h)) {
    return { tipo: "fob", confianca: 0.95 };
  }
  if (/fob\s*\/?\s*kg|pre[cç]o\s*fob|preco\s*fob|usd\s*\/?\s*kg\s*imp|dol.*kg.*imp/i.test(h)) {
    return { tipo: "fob_kg", confianca: 0.92 };
  }
  if (/subitem\s*ncm/i.test(h) && !/cod/i.test(h)) {
    return { tipo: "descricao", confianca: 0.88 };
  }
  for (const { tipo, re } of PADROES) {
    if (re.test(h)) return { tipo, confianca: 0.85 };
  }
  return { tipo: "desconhecido", confianca: 0 };
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  let s = String(v).trim();
  // 4,250.00 (US) → remove milhar; 1,95 (BR) → vírgula decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/,/g, "");
  } else {
    s = s.replace(/,/g, ".");
  }
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

/** Pontua linha de cabeçalho — prefere tabela de itens (desc + qty + fob) sobre metadados. */
function scoreHeaderRow(row: unknown[]): number {
  if (!Array.isArray(row)) return -1;
  const filled = row.filter((c) => c !== null && String(c).trim() !== "").length;
  if (filled < 3) return -1;

  let score = 0;
  const joined = row.map((c) => String(c ?? "")).join(" ");
  for (const c of row) {
    const { tipo } = detectarTipo(String(c ?? ""));
    if (tipo === "descricao") score += 4;
    if (tipo === "qtd") score += 3;
    if (tipo === "peso") score += 2;
    if (tipo === "fob") score += 3;
    if (tipo === "preco") score += 2;
  }
  if (/description|品名|description/i.test(joined) && /qty|数量|quantity/i.test(joined)) score += 5;
  if (/fob|总额|total.*usd/i.test(joined)) score += 2;
  if (/quotation|报价|incoterm|validity|客户/i.test(joined) && score < 8) score -= 3;
  return score;
}

function encontrarHeader(rows: unknown[][]): number {
  let best = 0;
  let bestScore = -1;
  for (let i = 0; i < Math.min(40, rows.length); i++) {
    const score = scoreHeaderRow(rows[i] ?? []);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Quando há várias colunas do mesmo tipo, prefere cabeçalho de total sobre unitário. */
function escolherColuna(
  colunas: ColunaMapeada[],
  tipo: ColunaDetectada,
  opts?: { prefer?: RegExp; avoid?: RegExp },
): number | undefined {
  const matches = colunas.filter((c) => c.tipo === tipo);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0]!.indice;

  let best = matches[0]!;
  let bestScore = -Infinity;
  for (const c of matches) {
    const h = c.header.replace(/\s+/g, " ");
    let score = c.confianca;
    if (opts?.prefer?.test(h)) score += 20;
    if (opts?.avoid?.test(h)) score -= 20;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best.indice;
}

const RE_QTD_CAIXAS = /qtd\s*caixas|qtde\s*caixas|quantidade\s*caixas|箱数|number\s*of\s*cartons?|cartons?\s*qty/i;
const RE_QTD_POR_CAIXA =
  /qtd\s*por\s*caixa|qtde\s*por\s*caixa|por\s*caixa|per\s*box|per\s*case|每箱|单箱个数|装箱量|pcs\s*per/i;
const RE_PESO_TOTAL = /总|total|合计/i;
const RE_PESO_UNIT = /unit|unitário|unitario|unitario|单件|每件|per\s*unit|per\s*pc|per\s*piece|\/\s*un/i;
const RE_MATERIAL = /material|材质|mat[eé]ria/i;
const RE_USO = /uso|用途|usage|application|aplica[cç][aã]o/i;

function indicePorHeader(colunas: ColunaMapeada[], re: RegExp): number | undefined {
  return colunas.find((c) => re.test(c.header.replace(/\s+/g, " ")))?.indice;
}

function escolherColunaPeso(
  colunas: ColunaMapeada[],
  bruto: boolean,
  modo: "total" | "unit",
): number | undefined {
  const tipo = bruto ? "peso_bruto" : "peso";
  if (modo === "total") {
    return escolherColuna(colunas, tipo, {
      prefer: RE_PESO_TOTAL,
      avoid: RE_PESO_UNIT,
    });
  }
  return escolherColuna(colunas, tipo, {
    prefer: RE_PESO_UNIT,
    avoid: RE_PESO_TOTAL,
  });
}

function resolverColunasPeso(
  colunas: ColunaMapeada[],
  bruto: boolean,
): { total?: number; unit?: number } {
  const candidatoTotal = escolherColunaPeso(colunas, bruto, "total");
  const candidatoUnit = escolherColunaPeso(colunas, bruto, "unit");

  if (candidatoTotal !== undefined && candidatoUnit !== undefined && candidatoTotal !== candidatoUnit) {
    return { total: candidatoTotal, unit: candidatoUnit };
  }

  const unico = candidatoUnit ?? candidatoTotal;
  if (unico === undefined) return {};

  const header = colunas.find((c) => c.indice === unico)?.header ?? "";
  if (RE_PESO_UNIT.test(header)) return { unit: unico };
  if (!bruto && /净重|net\s*weight|nw\b|peso\s*l[ií]q/i.test(header) && !RE_PESO_TOTAL.test(header)) {
    return { unit: unico };
  }
  if (bruto && /毛重|gross|gw\b|peso\s*bruto/i.test(header) && !RE_PESO_TOTAL.test(header)) {
    return { unit: unico };
  }
  if (RE_PESO_TOTAL.test(header)) return { total: unico };
  return { total: unico };
}

/** Linha de item com espaços (OCR tabular). */
const RE_LINHA_ITEM_OCR =
  /^(\d{1,3})\s+(.+?)\s+(\d{1,6})\s+([\d.,]+)\s+([\d.,]+)\s+([\d.,]+)\s*$/;

/** PDF nativo costuma colar colunas: 1Descrição500600.008.504,250.00 */
function parseLinhaItemColada(linha: string): string[] | null {
  const itemM = linha.trim().match(/^(\d{1,3})(.*)$/);
  const body = itemM?.[2];
  if (!itemM?.[1] || body === undefined || body.length === 0) return null;

  if (body.includes(",") && /,\d{3}\.\d{2}$/.test(body)) {
    for (let fobDigits = 1; fobDigits <= 3; fobDigits++) {
      const re = new RegExp(`([1-9]\\d{0,3}\\.\\d{2})(\\d{${fobDigits}})(,\\d{3}\\.\\d{2})$`);
      const unitFob = body.match(re);
      if (!unitFob?.[1] || !unitFob[2] || !unitFob[3]) continue;

      let s = body.slice(0, -unitFob[0].length);
      const unit = unitFob[1];
      const fob = unitFob[2] + unitFob[3];
      const fobN = num(fob);
      if (fobN === null || fobN <= 0) continue;

      let matched: string[] | null = null;
      for (let wLen = 2; wLen <= 5; wLen++) {
        const wRe = new RegExp(`(\\d{${wLen}}\\.\\d{2})$`);
        const weightM = s.match(wRe);
        if (!weightM?.[1]) continue;

        const s2 = s.slice(0, -weightM[1].length);
        const qtyM = s2.match(/(\d{1,6})$/);
        if (!qtyM?.[1]) continue;

        const desc = s2.slice(0, -qtyM[1].length).trim();
        if (desc.length < 2) continue;

        const qtd = num(qtyM[1]);
        const preco = num(unit);
        if (qtd === null || preco === null) continue;
        const diff = Math.abs(qtd * preco - fobN) / fobN;
        if (diff > 0.08) continue;

        matched = [itemM[1], desc, qtyM[1], weightM[1], unit, fob];
        break;
      }
      if (matched) return matched;
    }
  }

  const item = body.match(RE_LINHA_ITEM_OCR);
  if (item) {
    return [itemM[1], item[2]!.trim(), item[3]!, item[4]!, item[5]!, item[6]!];
  }

  return null;
}

function splitOcrLine(linha: string): string[] {
  const t = linha.trim();
  if (!t) return [];
  if (t.includes("\t")) return t.split("\t").map((c) => c.trim()).filter(Boolean);
  if (t.includes("|")) return t.split("|").map((c) => c.trim()).filter(Boolean);

  const colada = parseLinhaItemColada(t);
  if (colada) return colada;

  const item = t.match(RE_LINHA_ITEM_OCR);
  if (item) {
    return [item[1]!, item[2]!, item[3]!, item[4]!, item[5]!, item[6]!];
  }

  const cols = t.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
  if (cols.length >= 3) return cols;
  return [t];
}

/** Converte texto OCR (linhas) em matriz de células — tab, pipe, linha de item ou espaços múltiplos. */
export function textoOcrParaLinhas(texto: string): unknown[][] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0)
    .map((linha) => splitOcrLine(linha));
}

/** Fallback: extrai itens quando OCR devolve uma célula por linha (PDF com espaços simples). */
function extrairItensOcrLinhaUnica(rows: unknown[][]): LinhaFornecedor[] | null {
  const itens: LinhaFornecedor[] = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row?.length) continue;
    if (row.length >= 6) {
      const cells = row.map((c) => String(c ?? "").trim());
      const qtd = num(cells[2]);
      const precoUnitario = num(cells[4]);
      let fobTotalUS = num(cells[5]);
      if (fobTotalUS === null && precoUnitario !== null && qtd !== null) {
        fobTotalUS = precoUnitario * qtd;
      }
      if ((cells[1]?.length ?? 0) >= 2 && (qtd !== null || fobTotalUS !== null)) {
        itens.push({
          linha: r + 1,
          descricao: cells[1]!,
          qtd,
          pesoLiqKg: num(cells[3]),
          pesoBrutoKg: null,
          precoUnitario,
          fobTotalUS,
          ncm: null,
          raw: { ocr: cells.join("\t") },
        });
        continue;
      }
    }

    const texto =
      row.length === 1
        ? String(row[0] ?? "").trim()
        : row.map((c) => String(c ?? "")).join(" ").trim();

    const colada = parseLinhaItemColada(texto);
    const m = colada ? null : texto.match(RE_LINHA_ITEM_OCR);
    const cells = colada ?? (m ? [m[1]!, m[2]!, m[3]!, m[4]!, m[5]!, m[6]!] : null);
    if (!cells) continue;

    const qtd = num(cells[2]);
    const precoUnitario = num(cells[4]);
    let fobTotalUS = num(cells[5]);
    if (fobTotalUS === null && precoUnitario !== null && qtd !== null) {
      fobTotalUS = precoUnitario * qtd;
    }
    itens.push({
      linha: r + 1,
      descricao: cells[1]!.trim(),
      qtd,
      pesoLiqKg: num(cells[3]),
      pesoBrutoKg: null,
      precoUnitario,
      fobTotalUS,
      ncm: null,
      raw: { ocr: texto },
    });
  }
  return itens.length >= 1 ? itens : null;
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

  const iDescPt = colunas.find((c) => /portugues|português/i.test(c.header))?.indice;
  const iModel = colunas.find((c) => /model|modelo|产品型号/i.test(c.header))?.indice;
  const iDescEn = colunas.find((c) => /英文|english.*trade|trade name/i.test(c.header) && !/^品名/i.test(c.header))?.indice;
  const iDesc =
    colunas.find((c) => /产品配置|product\s*config/i.test(c.header))?.indice ??
    escolherColuna(colunas, "descricao", {
      prefer: /portugues|português|model|modelo|英文|english/i,
      avoid: /^品名|product\s*image|imag/i,
    });
  const iSku = colunas.find((c) => /货号|item\s*number|REF|唛头/i.test(c.header))?.indice;
  const iQtd = escolherColuna(colunas, "qtd", {
    prefer: /总数量|qtd\s*tot|quantidade\s*total|total.*qty|total.*quant/i,
    avoid: /每箱|per\s*case|por\s*caixa|quantity\s*per|装箱量|单箱个数|caixas?|cartons?/i,
  });
  const iQtdCaixas = indicePorHeader(colunas, RE_QTD_CAIXAS);
  const iQtdPorCaixa = indicePorHeader(colunas, RE_QTD_POR_CAIXA);
  const pesoLiqCols = resolverColunasPeso(colunas, false);
  const pesoBrutoCols = resolverColunasPeso(colunas, true);
  const iPreco = escolherColuna(colunas, "preco");
  const iFob = escolherColuna(colunas, "fob", {
    prefer: /valor\s*total\s*fob|total.*fob|fob\s*total|amount|总价/i,
    avoid: /\/\s*kg|fob\s*\/?\s*kg|usd\s*\/?\s*kg/i,
  });
  const iFobKg = escolherColuna(colunas, "fob_kg", {
    prefer: /fob\s*\/?\s*kg|valor\s*fob\s*\/?\s*kg|usd\s*\/?\s*kg/i,
    avoid: /total/i,
  });
  const iNcm = escolherColuna(colunas, "ncm");
  const iMaterial = indicePorHeader(colunas, RE_MATERIAL);
  const iUso = indicePorHeader(colunas, RE_USO);

  const ehReferenciaComex = colunas.some((c) => /cod subitem ncm/i.test(c.header));
  if (ehReferenciaComex) {
    avisos.push(
      "Planilha de referência ComexStat (FOB/kg por NCM) — para cotar, envie a planilha do fornecedor (fatura/装箱单) com FOB e peso por item.",
    );
  }

  if (iDesc === undefined) {
    avisos.push("Coluna de descrição não detectada — revise o mapeamento manual.");
  }

  const linhas: LinhaFornecedor[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[] | undefined;
    if (!row) continue;

    const parteModel = iModel !== undefined ? String(row[iModel] ?? "").trim() : "";
    const partePt = iDescPt !== undefined ? String(row[iDescPt] ?? "").trim() : "";
    const parteEn = iDescEn !== undefined ? String(row[iDescEn] ?? "").trim() : "";
    const parteDesc = iDesc !== undefined ? String(row[iDesc] ?? "").trim() : "";
    const parteSku = iSku !== undefined ? String(row[iSku] ?? "").trim() : "";
    const descricao =
      [parteModel, partePt || parteEn || parteDesc, parteSku !== parteModel ? parteSku : ""]
        .filter(Boolean)
        .join(" — ") ||
      parteDesc ||
      parteSku;
    if (!descricao || descricao.length < 2) continue;
    if (/^total$/i.test(descricao.trim())) continue;

    const qtdRaw = iQtd !== undefined ? num(row[iQtd]) : null;
    const qtdCaixas = iQtdCaixas !== undefined ? num(row[iQtdCaixas]) : null;
    const qtdPorCaixa = iQtdPorCaixa !== undefined ? num(row[iQtdPorCaixa]) : null;
    const pesoCalc = calcularPesosTotaisLinha({
      pesoLiqTotal: pesoLiqCols.total !== undefined ? num(row[pesoLiqCols.total]) : null,
      pesoBrutoTotal: pesoBrutoCols.total !== undefined ? num(row[pesoBrutoCols.total]) : null,
      pesoLiqUnit: pesoLiqCols.unit !== undefined ? num(row[pesoLiqCols.unit]) : null,
      pesoBrutoUnit: pesoBrutoCols.unit !== undefined ? num(row[pesoBrutoCols.unit]) : null,
      qtd: qtdRaw,
      qtdCaixas,
      qtdPorCaixa,
    });
    const qtd = pesoCalc.qtd ?? qtdRaw;
    const pesoLiqKg = pesoCalc.pesoLiqKg;
    const pesoBrutoKg = pesoCalc.pesoBrutoKg;
    const precoUnitario = iPreco !== undefined ? num(row[iPreco]) : null;
    const fobKgRef = iFobKg !== undefined ? num(row[iFobKg]) : null;
    let fobTotalUS = iFob !== undefined ? num(row[iFob]) : null;
    if (fobTotalUS === null && precoUnitario !== null && qtd !== null) {
      fobTotalUS = precoUnitario * qtd;
    }
    if (fobTotalUS === null && fobKgRef !== null && pesoLiqKg !== null && pesoLiqKg > 0) {
      fobTotalUS = fobKgRef * pesoLiqKg;
    }
    if (fobTotalUS === null && fobKgRef !== null && pesoBrutoKg !== null && pesoBrutoKg > 0) {
      fobTotalUS = fobKgRef * pesoBrutoKg;
    }
    const ncmRaw = iNcm !== undefined ? String(row[iNcm] ?? "").trim() : "";
    const ncm = ncmRaw ? ncmRaw.replace(/\D/g, "").padStart(8, "0").slice(0, 8) : null;
    const material = iMaterial !== undefined ? String(row[iMaterial] ?? "").trim() || null : null;
    const uso = iUso !== undefined ? String(row[iUso] ?? "").trim() || null : null;

    const raw: Record<string, unknown> = {};
    colunas.forEach((c) => {
      raw[c.header] = row[c.indice];
    });

    linhas.push({
      linha: r + 1,
      descricao,
      qtd,
      qtdCaixas,
      qtdPorCaixa,
      pesoLiqKg,
      pesoBrutoKg,
      precoUnitario,
      fobTotalUS,
      ncm: ncm && ncm.length === 8 ? ncm : null,
      material,
      uso,
      raw,
    });
  }

  if (linhas.length === 0) {
    avisos.push("Nenhuma linha de item encontrada após o cabeçalho.");
  }

  return { aba, headerRow, colunas, linhas, avisos };
}

/** Expõe parse interno para testes (matriz de linhas, sem imagens). */
export function parsePlanilhaRows(rows: unknown[][], aba = "Sheet1"): ResultadoParse {
  return parseRows(rows, aba);
}

export async function parsePlanilhaBuffer(
  buffer: ArrayBuffer | Buffer,
  nomeAba?: string,
): Promise<ResultadoParse> {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const aba = nomeAba && wb.SheetNames.includes(nomeAba) ? nomeAba : wb.SheetNames[0]!;
  const ws = wb.Sheets[aba]!;
  const rows = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];

  const parsed = parseRows(rows, aba);

  try {
    let fotos = new Map<number, FotoPlanilha>();
    let mediaCount = 0;

    if (isZipXlsx(buf)) {
      const zipOut = await extrairFotosXlsx(buf);
      fotos = zipOut.fotos;
      mediaCount = zipOut.mediaCount;
    } else if (isOleXls(buf)) {
      const imagens = extrairImagensWpsOle(buf);
      mediaCount = imagens.length;
      const disp = mapDispimgLinhas(ws);
      if (disp.size > 0 && imagens.length > 0) {
        for (const [linhaExcel, imgIdx] of disp) {
          const img = imagens[imgIdx];
          if (img) {
            fotos.set(linhaExcel, { linhaExcel, buffer: img.buffer, mime: img.mime });
          }
        }
      } else if (imagens.length > 0) {
        for (let i = 0; i < imagens.length; i++) {
          fotos.set(-(i + 1), {
            linhaExcel: 0,
            buffer: imagens[i]!.buffer,
            mime: imagens[i]!.mime,
          });
        }
      }
      if (mediaCount > 0 && fotos.size === 0) {
        parsed.avisos.push(
          `Planilha WPS (.xls) com ${mediaCount} imagem(ns) — salve como .xlsx se as fotos não vincularem.`,
        );
      }
    }

    if (fotos.size > 0) {
      parsed.linhas = associarFotosLinhas(parsed.linhas, fotos);
      const comFoto = parsed.linhas.filter((l) => l.fotoBase64).length;
      const fmt = isOleXls(buf) ? "WPS/.xls" : "Excel";
      parsed.avisos.push(`${comFoto} foto(s) vinculada(s) (${mediaCount} no arquivo ${fmt}).`);
    } else if (mediaCount > 0) {
      parsed.avisos.push(
        `Planilha contém ${mediaCount} imagem(ns), mas não foi possível vincular aos itens.`,
      );
    }
  } catch {
    parsed.avisos.push("Não foi possível ler imagens embutidas desta planilha.");
  }

  return parsed;
}

/** Texto extraído por OCR (PDF/imagem) → mesmo pipeline de colunas/linhas. */
export function parseOcrTexto(texto: string, origem = "OCR"): ResultadoParse {
  const rows = textoOcrParaLinhas(texto);
  const avisos = ["Origem: OCR — revise o mapeamento se necessário."];
  if (rows.length === 0) {
    avisos.push("OCR não gerou linhas legíveis.");
    return parseRows(rows, origem, avisos);
  }

  const diretas = extrairItensOcrLinhaUnica(rows);
  if (diretas && diretas.length > 0) {
    avisos.push(`Itens detectados por padrão OCR (${diretas.length} linha(s)).`);
    return {
      aba: origem,
      headerRow: 0,
      colunas: [
        { indice: 0, header: "No.", tipo: "desconhecido", confianca: 0 },
        { indice: 1, header: "Description", tipo: "descricao", confianca: 0.85 },
        { indice: 2, header: "Qty", tipo: "qtd", confianca: 0.85 },
        { indice: 3, header: "Net Weight (kg)", tipo: "peso", confianca: 0.85 },
        { indice: 4, header: "Unit Price USD", tipo: "preco", confianca: 0.85 },
        { indice: 5, header: "FOB Total USD", tipo: "fob", confianca: 0.85 },
      ],
      linhas: diretas,
      avisos,
    };
  }

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
    qtdCaixas: l.qtdCaixas ?? null,
    qtdPorCaixa: l.qtdPorCaixa ?? null,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobUnitarioUS: l.precoUnitario,
    fobTotalUS: l.fobTotalUS,
    dimensoes: null,
    material: l.material ?? null,
    uso: l.uso ?? null,
    ...(l.fotoBase64 ? { fotoBase64: l.fotoBase64, fotoMime: l.fotoMime } : {}),
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
export async function parseSupplierFile(bytes: Uint8Array): Promise<ParsedSupplierFile> {
  return resultadoParaSupplier(await parsePlanilhaBuffer(Buffer.from(bytes)));
}

/** Texto OCR → estrutura de cotação. */
export function parseSupplierOcrText(texto: string, origem?: string): ParsedSupplierFile {
  return resultadoParaSupplier(parseOcrTexto(texto, origem));
}
