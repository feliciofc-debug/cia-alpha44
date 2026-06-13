/**
 * Metadados em abas auxiliares (ex.: Auftrag) — moeda, Sammelkarton, etc.
 */

import * as XLSX from "xlsx";
import { avisoMoedaEurSeAplicavel } from "@cia/shared";

export interface MetadadosPlanilha {
  moeda?: string;
  sammelkarton?: string;
  avisos: string[];
}

const RE_MOEDA = /währung|moeda|currency|devise|moneda/i;
const RE_SAMMEL = /sammelkarton|caixa\s*compartilhada|shared\s*carton/i;

function normalizarMoeda(raw: string): string | undefined {
  const u = raw.trim().toUpperCase();
  if (/EUR|€/.test(u)) return "EUR";
  if (/USD|US\$|U\.S\.D/.test(u)) return "US$";
  if (/BRL|R\$|REAL/.test(u)) return "R$";
  return raw.trim() || undefined;
}

/** Lê pares campo|valor em abas tipo Auftrag / metadata. */
export function extrairMetadadosWorkbook(wb: XLSX.WorkBook): MetadadosPlanilha {
  const avisos: string[] = [];
  let moeda: string | undefined;
  let sammelkarton: string | undefined;

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
    for (const row of rows.slice(0, 30)) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const campo = String(row[0] ?? "").trim();
      const valor = String(row[1] ?? "").trim();
      if (!campo || !valor) continue;

      if (RE_MOEDA.test(campo)) {
        moeda = normalizarMoeda(valor) ?? moeda;
      }
      if (/hinweis|nota|obs|remark/i.test(campo) && RE_SAMMEL.test(valor)) {
        const m = valor.match(/sammelkarton\s*(\d{3,4})/i);
        if (m) sammelkarton = m[1];
      }
    }
  }

  return { moeda, sammelkarton, avisos };
}

export function avisoMoedaPlanilha(moedaPlanilha: string, moedaCotacao = "US$"): string | null {
  return avisoMoedaEurSeAplicavel(moedaPlanilha, moedaCotacao);
}
