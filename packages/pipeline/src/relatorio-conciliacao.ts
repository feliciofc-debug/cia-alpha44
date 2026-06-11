/**
 * Relatório de conciliação — exportação XLSX/CSV por cotação.
 */

import ExcelJS from "exceljs";
import type { Cotacao, Item } from "@cia/shared";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import { pesoParaBaseFob } from "./detectar-base-peso-fob.js";

/** T7 substituirá por rastro real por tributo {valor, fonte, consultadoEm}. */
export const FONTE_ALIQUOTA_TEC_PADRAO =
  "TEC Res. Gecex 770/2025 + TIPI Decreto 12.665/2025";

export interface RelatorioConciliacaoInput {
  cotacao: Cotacao;
  itens: Item[];
  resultado?: ResultadoCotacao | null;
  provider?: string | null;
  cotacaoId?: string | null;
  geradoEm?: Date;
}

export interface LinhaConciliacao {
  num: number;
  modelo: string;
  descZhEn: string;
  descPt: string;
  material: string;
  uso: string;
  ncm: string;
  ncmFonte: string;
  ncmConfianca: string;
  compatibilidade: string;
  motivoCompatibilidade: string;
  iiPct: string;
  ipiPct: string;
  pisPct: string;
  cofinsPct: string;
  fonteAliquota: string;
  qtd: string;
  pesoLiqUnitKg: string;
  pesoBrutoUnitKg: string;
  pesoLiqTotalKg: string;
  pesoBrutoTotalKg: string;
  fobUnitUS: string;
  fobTotalUS: string;
  fobKg: string;
  fobKgFonte: string;
  fobKgBase: string;
  avisos: string;
}

const COLUNAS: (keyof LinhaConciliacao)[] = [
  "num",
  "modelo",
  "descZhEn",
  "descPt",
  "material",
  "uso",
  "ncm",
  "ncmFonte",
  "ncmConfianca",
  "compatibilidade",
  "motivoCompatibilidade",
  "iiPct",
  "ipiPct",
  "pisPct",
  "cofinsPct",
  "fonteAliquota",
  "qtd",
  "pesoLiqUnitKg",
  "pesoBrutoUnitKg",
  "pesoLiqTotalKg",
  "pesoBrutoTotalKg",
  "fobUnitUS",
  "fobTotalUS",
  "fobKg",
  "fobKgFonte",
  "fobKgBase",
  "avisos",
];

const ROTULOS: Record<keyof LinhaConciliacao, string> = {
  num: "#",
  modelo: "Modelo",
  descZhEn: "Descrição ZH/EN",
  descPt: "Descrição PT",
  material: "Material",
  uso: "Uso",
  ncm: "NCM",
  ncmFonte: "Fonte NCM",
  ncmConfianca: "Confiança NCM",
  compatibilidade: "Compatibilidade",
  motivoCompatibilidade: "Motivo compat.",
  iiPct: "II %",
  ipiPct: "IPI %",
  pisPct: "PIS %",
  cofinsPct: "COFINS %",
  fonteAliquota: "Fonte alíquota",
  qtd: "Qtd",
  pesoLiqUnitKg: "Peso líq. unit. (kg)",
  pesoBrutoUnitKg: "Peso bruto unit. (kg)",
  pesoLiqTotalKg: "Peso líq. total (kg)",
  pesoBrutoTotalKg: "Peso bruto total (kg)",
  fobUnitUS: "FOB unit. (US$)",
  fobTotalUS: "FOB total (US$)",
  fobKg: "FOB/kg (US$)",
  fobKgFonte: "fobKgFonte",
  fobKgBase: "fobKgBase",
  avisos: "Avisos",
};

function pctFracao(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(2).replace(".", ",")}%`;
}

function numFmt(n: number | null | undefined, dec = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(dec).replace(".", ",");
}

function numRaw(n: number | null | undefined, dec = 4): number | null {
  if (n == null || Number.isNaN(n)) return null;
  return Number(n.toFixed(dec));
}

export function parseModelo(descOriginal: string): string {
  const m = descOriginal.match(/^([A-Z0-9-]+)\s*—/);
  return m ? m[1]! : descOriginal.slice(0, 20);
}

export function parseDescZhEn(descOriginal: string): string {
  const parts = descOriginal.split("—").map((s) => s.trim());
  if (parts.length >= 2) return parts.slice(1).join(" — ").replace(/\s*—\s*[\d.-]+$/, "");
  return descOriginal;
}

export function fonteAliquotaItem(it: Item): string {
  if (it.aliquotasOverride) return "manual (editado na cotação)";
  return FONTE_ALIQUOTA_TEC_PADRAO;
}

function avisosItem(it: Item): string {
  const parts: string[] = [];
  if (it.ncmAvisos?.length) parts.push(...it.ncmAvisos);
  if (it.fobKgAvisos?.length) parts.push(...it.fobKgAvisos);
  if (it.risco?.flags?.length) parts.push(...it.risco.flags);
  if (it.fobPendente) parts.push("FOB pendente");
  return parts.join(" · ") || "—";
}

export function montarLinhasConciliacao(itens: Item[]): LinhaConciliacao[] {
  return itens.map((it, i) => {
    const qtd = it.qtd != null && it.qtd > 0 ? it.qtd : null;
    const liqTot = it.pesoLiqKg > 0 ? it.pesoLiqKg : null;
    const brutoTot = it.pesoBrutoKg != null && it.pesoBrutoKg > 0 ? it.pesoBrutoKg : null;
    const liqUnit = qtd && liqTot ? liqTot / qtd : null;
    const brutoUnit = qtd && brutoTot ? brutoTot / qtd : null;
    const pesoFob = pesoParaBaseFob(it.fobKgBase ?? "liquido", it.pesoBrutoKg, it.pesoLiqKg);
    const fobKg = pesoFob > 0 && it.fobTotalUS > 0 ? it.fobTotalUS / pesoFob : null;

    return {
      num: i + 1,
      modelo: parseModelo(it.descOriginal),
      descZhEn: parseDescZhEn(it.descOriginal),
      descPt: it.descPt || "—",
      material: it.material?.trim() || "—",
      uso: it.uso?.trim() || "—",
      ncm: it.ncm || "—",
      ncmFonte: it.ncmFonte ?? "—",
      ncmConfianca: it.ncmConfianca != null ? it.ncmConfianca.toFixed(2) : "—",
      compatibilidade: it.compatibilidadeProduto ?? "—",
      motivoCompatibilidade: it.motivoCompatibilidade ?? "—",
      iiPct: pctFracao(it.aliquotas.ii),
      ipiPct: pctFracao(it.aliquotas.ipi),
      pisPct: pctFracao(it.aliquotas.pis),
      cofinsPct: pctFracao(it.aliquotas.cofins),
      fonteAliquota: fonteAliquotaItem(it),
      qtd: qtd != null ? String(qtd) : "—",
      pesoLiqUnitKg: liqUnit != null ? numFmt(liqUnit, 2) : "—",
      pesoBrutoUnitKg: brutoUnit != null ? numFmt(brutoUnit, 2) : "—",
      pesoLiqTotalKg: liqTot != null ? numFmt(liqTot, 2) : "—",
      pesoBrutoTotalKg: brutoTot != null ? numFmt(brutoTot, 2) : "—",
      fobUnitUS: it.fobUnitarioUS != null ? numFmt(it.fobUnitarioUS, 4) : "—",
      fobTotalUS: it.fobTotalUS > 0 ? numFmt(it.fobTotalUS, 2) : "—",
      fobKg: fobKg != null ? numFmt(fobKg, 4) : "—",
      fobKgFonte: it.fobKgFonte ?? "—",
      fobKgBase: it.fobKgBase ?? "—",
      avisos: avisosItem(it),
    };
  });
}

export interface TotaisConciliacao {
  fobTotalUS: number;
  pesoLiqKg: number;
  pesoBrutoKg: number;
  iiTotal: number | null;
  ipiTotal: number | null;
  pisTotal: number | null;
  cofinsTotal: number | null;
}

export function totaisConciliacao(itens: Item[], resultado?: ResultadoCotacao | null): TotaisConciliacao {
  const entrada = resultado?.entrada;
  return {
    fobTotalUS: entrada?.fobTotalUS ?? itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0),
    pesoLiqKg: itens.reduce((s, it) => s + (it.pesoLiqKg ?? 0), 0),
    pesoBrutoKg: itens.reduce((s, it) => s + (it.pesoBrutoKg ?? 0), 0),
    iiTotal: entrada?.iiTotal ?? null,
    ipiTotal: entrada?.ipiTotal ?? null,
    pisTotal: entrada?.pisTotal ?? null,
    cofinsTotal: entrada?.cofinsTotal ?? null,
  };
}

/** Slug seguro para nome de arquivo — fallback se cliente só tem CJK/especiais. */
export function nomeArquivoConciliacao(
  cliente: string,
  cotacaoId?: string | null,
  geradoEm = new Date(),
): string {
  const slug = cliente
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
  const dt = geradoEm.toISOString().slice(0, 10);
  if (slug && /[a-zA-Z]/.test(slug)) return `conciliacao-${slug}-${dt}`;
  const id = (cotacaoId ?? "nova").slice(0, 12);
  return `conciliacao-cotacao-${id}-${dt}`;
}

function csvEscape(v: string): string {
  if (v.includes(";") || v.includes('"') || v.includes("\n") || v.includes("\r")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function gerarCsvConciliacao(input: RelatorioConciliacaoInput): Buffer {
  const linhas = montarLinhasConciliacao(input.itens);
  const tot = totaisConciliacao(input.itens, input.resultado);
  const header = COLUNAS.map((k) => csvEscape(ROTULOS[k]));
  const rows = linhas.map((l) => COLUNAS.map((k) => csvEscape(String(l[k]))));
  const footer: string[] = Array.from({ length: COLUNAS.length }, () => "");
  footer[0] = csvEscape("TOTAIS");
  footer[12] = tot.iiTotal != null ? csvEscape(numFmt(tot.iiTotal, 2)) : "";
  footer[13] = tot.ipiTotal != null ? csvEscape(numFmt(tot.ipiTotal, 2)) : "";
  footer[14] = tot.pisTotal != null ? csvEscape(numFmt(tot.pisTotal, 2)) : "";
  footer[15] = tot.cofinsTotal != null ? csvEscape(numFmt(tot.cofinsTotal, 2)) : "";
  footer[19] = csvEscape(numFmt(tot.pesoLiqKg, 2));
  footer[20] = csvEscape(numFmt(tot.pesoBrutoKg, 2));
  footer[22] = csvEscape(numFmt(tot.fobTotalUS, 2));
  const body = [header, ...rows, footer].map((r) => r.join(";")).join("\n");
  return Buffer.from("\uFEFF" + body, "utf8");
}

export async function gerarXlsxConciliacao(input: RelatorioConciliacaoInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CIA Alpha 44";
  wb.created = input.geradoEm ?? new Date();

  const shMeta = wb.addWorksheet("Cabecalho");
  const metaRows: [string, string | number][] = [
    ["Cliente", input.cotacao.cliente],
    ["Empresa trade", input.cotacao.empresaTrade ?? ""],
    ["Provider", input.provider ?? "—"],
    ["Câmbio", input.cotacao.cambio],
    ["Frete US$", input.cotacao.freteTotalUS],
    ["Incoterm", input.cotacao.incoterm],
    ["Benefício fiscal", input.cotacao.benefFiscal],
    ["Rota", `${input.cotacao.origem} → ${input.cotacao.destino}`],
    ["Itens", input.itens.length],
  ];
  shMeta.addRows([["Campo", "Valor"], ...metaRows]);

  const sh = wb.addWorksheet("Conciliacao");
  sh.addRow(COLUNAS.map((k) => ROTULOS[k]));
  const linhas = montarLinhasConciliacao(input.itens);
  for (const l of linhas) {
    sh.addRow(COLUNAS.map((k) => l[k]));
  }

  const tot = totaisConciliacao(input.itens, input.resultado);
  sh.addRow([]);
  const footerRow: (string | number | null)[] = Array.from({ length: COLUNAS.length }, () => "");
  footerRow[0] = "TOTAIS";
  footerRow[12] = tot.iiTotal != null ? numRaw(tot.iiTotal, 2) : "";
  footerRow[13] = tot.ipiTotal != null ? numRaw(tot.ipiTotal, 2) : "";
  footerRow[14] = tot.pisTotal != null ? numRaw(tot.pisTotal, 2) : "";
  footerRow[15] = tot.cofinsTotal != null ? numRaw(tot.cofinsTotal, 2) : "";
  footerRow[19] = numRaw(tot.pesoLiqKg, 2);
  footerRow[20] = numRaw(tot.pesoBrutoKg, 2);
  footerRow[22] = numRaw(tot.fobTotalUS, 2);
  sh.addRow(footerRow);

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function gerarConciliacaoBuffer(
  input: RelatorioConciliacaoInput,
  formato: "xlsx" | "csv",
): Promise<Buffer> {
  return formato === "csv" ? gerarCsvConciliacao(input) : gerarXlsxConciliacao(input);
}
