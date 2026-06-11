/**
 * Parser da planilha mensal de referência FOB/kg (INNOVE / Comex Plus).
 * Col 3 = média simples por DI · Col 4 = média ponderada FOB/KG.
 */

import * as XLSX from "xlsx";
import { normalizarNcm } from "./benchmark.js";
import { periodoLabel } from "./benchmark-metrics.js";

export interface BenchmarkPlanilhaEntry {
  ncm: string;
  desc: string;
  /** Col 3 — média simples por DI (primária). */
  fobKgMedioDI: number;
  /** Col 4 — média ponderada FOB/KG. */
  fobKgPonderado: number | null;
  cifKg: number | null;
  amostra: number;
  /** @deprecated alias de fobKgMedioDI */
  fobKg: number;
}

export interface BenchmarkPlanilhaSeed {
  fonte: string;
  arquivo: string;
  contexto: string;
  /** Período real dos dados (ex.: 2023-S1). */
  periodoReferencia?: string;
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
  iFobKgMedioDI: number;
  iFobKgPonderado: number;
  iCifKg: number;
  iAmostra: number;
} {
  const h = header.map(normHeader);
  const iNcm = h.findIndex((x) => /NCM|SUBITEM|COD/.test(x) && /NCM|SUBITEM/.test(x));
  const iNcmFallback = h.findIndex((x) => x.includes("NCM"));
  const idxNcm = iNcm >= 0 ? iNcm : iNcmFallback >= 0 ? iNcmFallback : 0;

  let iFobKgMedioDI = h.findIndex((x) => /FOB\s*\/?\s*KG|FOB\/KG|US\$\/KG|USD\/KG|FOB KG/.test(x));
  if (iFobKgMedioDI < 0) iFobKgMedioDI = 3;

  let iFobKgPonderado = h.findIndex(
    (x, i) => i !== iFobKgMedioDI && /PONDER|VOLUME|FOB.*2|FOB\s*\/?\s*KG/.test(x),
  );
  if (iFobKgPonderado < 0) iFobKgPonderado = iFobKgMedioDI >= 0 ? iFobKgMedioDI + 1 : 4;

  const iDesc = h.findIndex((x) => /DESC|PRODUTO|NOME/.test(x));
  const iCifKg = h.findIndex((x) => /CIF\s*\/?\s*KG|CIF\/KG/.test(x));
  const iAmostra = h.findIndex((x) => /AMOSTRA|QTD|DI|CONTAGEM/.test(x));

  return {
    iNcm: idxNcm,
    iDesc: iDesc >= 0 ? iDesc : 1,
    iFobKgMedioDI,
    iFobKgPonderado,
    iCifKg: iCifKg >= 0 ? iCifKg : 5,
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

/** Extrai período do cabeçalho (linha ~3: 2023-S1 / China / marítima). */
function extrairPeriodoReferencia(rows: unknown[][]): string | undefined {
  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const linha = (rows[i] ?? []).map((c) => String(c ?? "")).join(" ");
    const m = linha.match(/(20\d{2})[-\s]?S([12])/i);
    if (m) return `${m[1]}-S${m[2]}`;
    const m2 = linha.match(/(20\d{2})[-/](0[1-9]|1[0-2]).*(20\d{2})[-/](0[1-9]|1[0-2])/);
    if (m2) return periodoLabel(`${m2[1]}-${m2[2]}`, `${m2[3]}-${m2[4]}`);
  }
  return undefined;
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

  const periodoReferencia = extrairPeriodoReferencia(rows);
  const headerIdx = localizarHeader(rows);
  const cols = detectarColunas(rows[headerIdx] ?? []);

  const map = new Map<string, BenchmarkPlanilhaEntry>();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    const ncm = normalizarNcm(String(r[cols.iNcm] ?? ""));
    if (ncm.length !== 8 || ncm === "00000000") continue;
    const desc = String(r[cols.iDesc] ?? "")
      .replace(/^['\-\s]+/, "")
      .trim();
    const fobKgMedioDI = num(r[cols.iFobKgMedioDI]);
    const fobKgPonderado = num(r[cols.iFobKgPonderado]);
    const cifKg = num(r[cols.iCifKg]);
    const amostra = num(r[cols.iAmostra]) ?? 0;
    if (fobKgMedioDI === null && fobKgPonderado === null) continue;

    const prev = map.get(ncm);
    if (prev) {
      const a = prev.amostra + amostra || 1;
      prev.fobKgMedioDI =
        fobKgMedioDI !== null
          ? (prev.fobKgMedioDI * prev.amostra + fobKgMedioDI * amostra) / a
          : prev.fobKgMedioDI;
      if (fobKgPonderado !== null) {
        prev.fobKgPonderado =
          prev.fobKgPonderado != null
            ? (prev.fobKgPonderado * prev.amostra + fobKgPonderado * amostra) / a
            : fobKgPonderado;
      }
      prev.cifKg =
        cifKg !== null && prev.cifKg != null
          ? (prev.cifKg * prev.amostra + cifKg * amostra) / a
          : (cifKg ?? prev.cifKg);
      prev.amostra = a;
      prev.fobKg = prev.fobKgMedioDI;
      if (desc && !prev.desc) prev.desc = desc;
    } else {
      map.set(ncm, {
        ncm,
        desc: desc.slice(0, 120),
        fobKgMedioDI: fobKgMedioDI ?? fobKgPonderado ?? 0,
        fobKgPonderado: fobKgPonderado ?? null,
        cifKg,
        amostra,
        fobKg: fobKgMedioDI ?? fobKgPonderado ?? 0,
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
    fobKgMedioDI: Number(e.fobKgMedioDI.toFixed(8)),
    fobKgPonderado: e.fobKgPonderado != null ? Number(e.fobKgPonderado.toFixed(8)) : null,
    fobKg: Number(e.fobKgMedioDI.toFixed(8)),
    cifKg: e.cifKg != null ? Number(e.cifKg.toFixed(6)) : null,
  }));

  const periodo = periodoReferencia ?? "referencia-operacional";
  return {
    fonte: "Planilha FOB/kg INNOVE",
    arquivo,
    contexto: `Referência operacional ${periodo} · upload ${arquivo}`,
    periodoReferencia: periodo,
    atualizadoEm: new Date().toISOString(),
    total: itens.length,
    itens,
  };
}

export function historicoFromPlanilhaSeed(seed: BenchmarkPlanilhaSeed) {
  return seed.itens.map((e) => ({
    ncm: e.ncm,
    fobKgMedioDI: e.fobKgMedioDI,
    fobKgPonderado: e.fobKgPonderado,
    fobKg: e.fobKgMedioDI,
    amostra: e.amostra > 0 ? e.amostra : 1,
  }));
}
