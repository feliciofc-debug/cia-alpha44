/**
 * Parser da planilha mensal de referência FOB/kg (INNOVE / Comex Plus).
 * Formato esperado: NCM + descrição + FOB/kg (compatível com "IMPORTAÇÕES DA CHINA NOVO.xlsx").
 */

import * as XLSX from "xlsx";
import { normalizarNcm } from "./benchmark.js";

export interface BenchmarkPlanilhaEntry {
  ncm: string;
  desc: string;
  fobKg: number;
  cifKg: number;
  amostra: number;
}

export interface BenchmarkPlanilhaSeed {
  fonte: string;
  arquivo: string;
  contexto: string;
  atualizadoEm: string;
  total: number;
  itens: BenchmarkPlanilhaEntry[];
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function normHeader(c: unknown): string {
  return String(c ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .trim();
}

function detectarColunas(header: unknown[]): {
  iNcm: number;
  iDesc: number;
  iFobKg: number;
  iCifKg: number;
  iAmostra: number;
} | null {
  const h = header.map(normHeader);
  const iNcm = h.findIndex((x) => /NCM|SUBITEM|COD/.test(x) && /NCM|SUBITEM/.test(x));
  const iNcmFallback = h.findIndex((x) => x.includes("NCM"));
  const idxNcm = iNcm >= 0 ? iNcm : iNcmFallback >= 0 ? iNcmFallback : 0;

  let iFobKg = h.findIndex((x) => /FOB\s*\/?\s*KG|FOB\/KG|US\$\/KG|USD\/KG|FOB KG/.test(x));
  if (iFobKg < 0) iFobKg = h.findIndex((x) => x === "FOB" || x.includes("FOB US"));
  if (iFobKg < 0) iFobKg = 3;

  const iDesc = h.findIndex((x) => /DESC|PRODUTO|NOME/.test(x));
  const iCifKg = h.findIndex((x) => /CIF\s*\/?\s*KG|CIF\/KG/.test(x));
  const iAmostra = h.findIndex((x) => /AMOSTRA|QTD|DI/.test(x));

  return {
    iNcm: idxNcm,
    iDesc: iDesc >= 0 ? iDesc : 1,
    iFobKg,
    iCifKg: iCifKg >= 0 ? iCifKg : 4,
    iAmostra: iAmostra >= 0 ? iAmostra : 5,
  };
}

function localizarHeader(rows: unknown[][]): number {
  const idx = rows.findIndex(
    (r) =>
      Array.isArray(r) &&
      r.some((c) => {
        const n = normHeader(c);
        return n.includes("NCM") || n.includes("SUBITEM");
      }),
  );
  return idx >= 0 ? idx : 3;
}

/** Extrai entradas FOB/kg de planilha Excel ou CSV. */
export function parseBenchmarkPlanilhaBuffer(bytes: Uint8Array, arquivo: string): BenchmarkPlanilhaSeed {
  const wb = XLSX.read(Buffer.from(bytes), { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("Planilha vazia — nenhuma aba encontrada.");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, {
    header: 1,
    raw: true,
    defval: null,
  });

  const headerIdx = localizarHeader(rows);
  const cols = detectarColunas(rows[headerIdx] ?? []);
  if (!cols) throw new Error("Cabeçalho da planilha não reconhecido.");

  const map = new Map<string, BenchmarkPlanilhaEntry>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const ncm = normalizarNcm(String(r[cols.iNcm] ?? ""));
    if (ncm.length !== 8 || ncm === "00000000") continue;
    const desc = String(r[cols.iDesc] ?? "")
      .replace(/^['\-\s]+/, "")
      .trim();
    const fobKg = num(r[cols.iFobKg]);
    const cifKg = num(r[cols.iCifKg]);
    const amostra = num(r[cols.iAmostra]) ?? 0;
    if (fobKg === null && cifKg === null) continue;

    const prev = map.get(ncm);
    if (prev) {
      const a = prev.amostra + amostra || 1;
      prev.fobKg = fobKg !== null ? (prev.fobKg * prev.amostra + fobKg * amostra) / a : prev.fobKg;
      prev.cifKg = cifKg !== null ? (prev.cifKg * prev.amostra + cifKg * amostra) / a : prev.cifKg;
      prev.amostra = a;
      if (desc && !prev.desc) prev.desc = desc;
    } else {
      map.set(ncm, {
        ncm,
        desc: desc.slice(0, 120),
        fobKg: fobKg ?? 0,
        cifKg: cifKg ?? fobKg ?? 0,
        amostra,
      });
    }
  }

  if (map.size === 0) {
    throw new Error(
      "Nenhum NCM com FOB/kg encontrado. Verifique se a planilha tem colunas NCM e FOB/kg (formato Comex Plus / IMPORTAÇÕES DA CHINA).",
    );
  }

  const itens = Array.from(map.values()).map((e) => ({
    ...e,
    fobKg: Number(e.fobKg.toFixed(6)),
    cifKg: Number(e.cifKg.toFixed(6)),
  }));

  const mesAno = new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return {
    fonte: "Planilha FOB/kg INNOVE",
    arquivo,
    contexto: `Referência operacional ${mesAno} · upload ${arquivo}`,
    atualizadoEm: new Date().toISOString(),
    total: itens.length,
    itens,
  };
}

export function historicoFromPlanilhaSeed(seed: BenchmarkPlanilhaSeed) {
  return seed.itens.map((e) => ({
    ncm: e.ncm,
    fobKg: e.fobKg,
    amostra: e.amostra > 0 ? e.amostra : 1,
  }));
}
