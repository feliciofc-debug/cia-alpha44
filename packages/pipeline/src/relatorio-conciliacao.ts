/**
 * Relatório de conciliação — exportação XLSX/CSV por cotação.
 */

import ExcelJS from "exceljs";
import type { Cotacao, Item } from "@cia/shared";
import {
  avisoMoedaEurSeAplicavel,
  colunasConsultadoEmExport,
  fonteExibicaoTributo,
  rastrosEfetivosItem,
} from "@cia/shared";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import { pesoParaBaseFob } from "./detectar-base-peso-fob.js";

/** @deprecated T7 — use rastros por tributo (fonteII…fonteCOFINS). */
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
  fonteII: string;
  fonteIPI: string;
  fontePIS: string;
  fonteCOFINS: string;
  consultadoEm?: string;
  consultadoEmII?: string;
  consultadoEmIPI?: string;
  consultadoEmPIS?: string;
  consultadoEmCOFINS?: string;
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

const COLUNAS_BASE: (keyof LinhaConciliacao)[] = [
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
  "fonteII",
  "fonteIPI",
  "fontePIS",
  "fonteCOFINS",
];

const COLUNAS_POS_FONTE: (keyof LinhaConciliacao)[] = [
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
  fonteII: "Fonte II",
  fonteIPI: "Fonte IPI",
  fontePIS: "Fonte PIS",
  fonteCOFINS: "Fonte COFINS",
  consultadoEm: "Consultado em",
  consultadoEmII: "Consultado em II",
  consultadoEmIPI: "Consultado em IPI",
  consultadoEmPIS: "Consultado em PIS",
  consultadoEmCOFINS: "Consultado em COFINS",
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

/** @deprecated T7 — use fonteExibicaoTributo com aliquotasRastro. */
export function fonteAliquotaItem(it: Item): string {
  const r = rastrosEfetivosItem(it);
  if (it.aliquotasOverride || r?.ii?.origem === "manual") {
    return r?.ii?.fonte ?? "manual (editado na cotação)";
  }
  if (r?.ii?.fonte && r.ii.origem !== "legado") return r.ii.fonte;
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

export function colunasConsultadoEmConciliacao(itens: Item[]): (keyof LinhaConciliacao)[] {
  const diverge = itens.some((it) => {
    const cols = colunasConsultadoEmExport(rastrosEfetivosItem(it));
    return "consultadoEmII" in cols;
  });
  if (diverge) {
    return ["consultadoEmII", "consultadoEmIPI", "consultadoEmPIS", "consultadoEmCOFINS"];
  }
  return ["consultadoEm"];
}

export function colunasConciliacao(itens: Item[]): (keyof LinhaConciliacao)[] {
  return [...COLUNAS_BASE, ...colunasConsultadoEmConciliacao(itens), ...COLUNAS_POS_FONTE];
}

function fontesLinha(it: Item): Pick<LinhaConciliacao, "fonteII" | "fonteIPI" | "fontePIS" | "fonteCOFINS"> {
  const r = rastrosEfetivosItem(it);
  const legado = !it.aliquotasRastro;
  return {
    fonteII: fonteExibicaoTributo(r?.ii, { legado, aliquotasOverride: it.aliquotasOverride }),
    fonteIPI: fonteExibicaoTributo(r?.ipi, { legado, aliquotasOverride: it.aliquotasOverride }),
    fontePIS: fonteExibicaoTributo(r?.pis, { legado, aliquotasOverride: it.aliquotasOverride }),
    fonteCOFINS: fonteExibicaoTributo(r?.cofins, { legado, aliquotasOverride: it.aliquotasOverride }),
  };
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
    const datas = colunasConsultadoEmExport(rastrosEfetivosItem(it));

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
      ...fontesLinha(it),
      ...datas,
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

function indiceColuna(colunas: (keyof LinhaConciliacao)[], chave: keyof LinhaConciliacao): number {
  return colunas.indexOf(chave);
}

function montarFooterTotais(
  colunas: (keyof LinhaConciliacao)[],
  tot: TotaisConciliacao,
): string[] {
  const footer: string[] = Array.from({ length: colunas.length }, () => "");
  footer[indiceColuna(colunas, "num")] = csvEscape("TOTAIS");
  const iiIdx = indiceColuna(colunas, "iiPct");
  const ipiIdx = indiceColuna(colunas, "ipiPct");
  const pisIdx = indiceColuna(colunas, "pisPct");
  const cofinsIdx = indiceColuna(colunas, "cofinsPct");
  const liqIdx = indiceColuna(colunas, "pesoLiqTotalKg");
  const brutoIdx = indiceColuna(colunas, "pesoBrutoTotalKg");
  const fobIdx = indiceColuna(colunas, "fobTotalUS");
  if (iiIdx >= 0 && tot.iiTotal != null) footer[iiIdx] = csvEscape(numFmt(tot.iiTotal, 2));
  if (ipiIdx >= 0 && tot.ipiTotal != null) footer[ipiIdx] = csvEscape(numFmt(tot.ipiTotal, 2));
  if (pisIdx >= 0 && tot.pisTotal != null) footer[pisIdx] = csvEscape(numFmt(tot.pisTotal, 2));
  if (cofinsIdx >= 0 && tot.cofinsTotal != null) footer[cofinsIdx] = csvEscape(numFmt(tot.cofinsTotal, 2));
  if (liqIdx >= 0) footer[liqIdx] = csvEscape(numFmt(tot.pesoLiqKg, 2));
  if (brutoIdx >= 0) footer[brutoIdx] = csvEscape(numFmt(tot.pesoBrutoKg, 2));
  if (fobIdx >= 0) footer[fobIdx] = csvEscape(numFmt(tot.fobTotalUS, 2));
  return footer;
}

export function gerarCsvConciliacao(input: RelatorioConciliacaoInput): Buffer {
  const linhas = montarLinhasConciliacao(input.itens);
  const colunas = colunasConciliacao(input.itens);
  const tot = totaisConciliacao(input.itens, input.resultado);
  const header = colunas.map((k) => csvEscape(ROTULOS[k]));
  const rows = linhas.map((l) => colunas.map((k) => csvEscape(String(l[k] ?? ""))));
  const footer = montarFooterTotais(colunas, tot);
  const body = [header, ...rows, footer].map((r) => r.join(";")).join("\n");
  return Buffer.from("\uFEFF" + body, "utf8");
}

export function metaConciliacao(input: RelatorioConciliacaoInput): [string, string | number][] {
  const avisoMoeda = avisoMoedaEurSeAplicavel(input.cotacao.moedaPlanilha, input.cotacao.moeda);
  const rows: [string, string | number][] = [
    ["Cliente", input.cotacao.cliente],
    ["Empresa trade", input.cotacao.empresaTrade ?? ""],
    ["Provider", input.provider ?? "—"],
    ["Moeda cotação", input.cotacao.moeda],
    ["Câmbio", input.cotacao.cambio],
    ["Frete US$", input.cotacao.freteTotalUS],
    ["Incoterm", input.cotacao.incoterm],
    ["Benefício fiscal", input.cotacao.benefFiscal],
    ["Rota", `${input.cotacao.origem} → ${input.cotacao.destino}`],
    ["Itens", input.itens.length],
  ];
  if (input.cotacao.moedaPlanilha) {
    rows.splice(4, 0, ["Moeda planilha", input.cotacao.moedaPlanilha]);
  }
  if (avisoMoeda) {
    const idx = input.cotacao.moedaPlanilha ? 5 : 4;
    rows.splice(idx, 0, ["Aviso moeda", avisoMoeda]);
  }
  return rows;
}

export async function gerarXlsxConciliacao(input: RelatorioConciliacaoInput): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "CIA Alpha 44";
  wb.created = input.geradoEm ?? new Date();

  const shMeta = wb.addWorksheet("Cabecalho");
  const metaRows = metaConciliacao(input);
  shMeta.addRows([["Campo", "Valor"], ...metaRows]);

  const colunas = colunasConciliacao(input.itens);
  const sh = wb.addWorksheet("Conciliacao");
  sh.addRow(colunas.map((k) => ROTULOS[k]));
  const linhas = montarLinhasConciliacao(input.itens);
  for (const l of linhas) {
    sh.addRow(colunas.map((k) => l[k] ?? ""));
  }

  const tot = totaisConciliacao(input.itens, input.resultado);
  sh.addRow([]);
  const footerRow: (string | number | null)[] = Array.from({ length: colunas.length }, () => "");
  footerRow[indiceColuna(colunas, "num")] = "TOTAIS";
  const iiIdx = indiceColuna(colunas, "iiPct");
  const ipiIdx = indiceColuna(colunas, "ipiPct");
  const pisIdx = indiceColuna(colunas, "pisPct");
  const cofinsIdx = indiceColuna(colunas, "cofinsPct");
  const liqIdx = indiceColuna(colunas, "pesoLiqTotalKg");
  const brutoIdx = indiceColuna(colunas, "pesoBrutoTotalKg");
  const fobIdx = indiceColuna(colunas, "fobTotalUS");
  if (iiIdx >= 0) footerRow[iiIdx] = tot.iiTotal != null ? numRaw(tot.iiTotal, 2) : "";
  if (ipiIdx >= 0) footerRow[ipiIdx] = tot.ipiTotal != null ? numRaw(tot.ipiTotal, 2) : "";
  if (pisIdx >= 0) footerRow[pisIdx] = tot.pisTotal != null ? numRaw(tot.pisTotal, 2) : "";
  if (cofinsIdx >= 0) footerRow[cofinsIdx] = tot.cofinsTotal != null ? numRaw(tot.cofinsTotal, 2) : "";
  if (liqIdx >= 0) footerRow[liqIdx] = numRaw(tot.pesoLiqKg, 2);
  if (brutoIdx >= 0) footerRow[brutoIdx] = numRaw(tot.pesoBrutoKg, 2);
  if (fobIdx >= 0) footerRow[fobIdx] = numRaw(tot.fobTotalUS, 2);
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
