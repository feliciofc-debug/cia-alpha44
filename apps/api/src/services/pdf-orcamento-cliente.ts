/**
 * PDF orçamento cliente — layout idêntico ao modelo Comex Plus / INNOVE 888.
 * Referência: tools/referencia/modelo-orcamento-cliente-paulo.pdf
 */

import PDFDocument from "pdfkit";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao, Despesa, Item } from "@cia/shared";
import { formatNcm } from "@cia/shared";
import { fotosParaPdf, primeiraFotoParaPdf } from "./pdf-fotos.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGO_PATH = path.join(__dirname, "..", "assets", "logo-innove888.jpeg");

export interface PayloadOrcamentoCliente {
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao;
  criadoEm?: string;
}

function fmtBrl(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsd(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseDataIso(iso: string) {
  const src = iso.slice(0, 10);
  const [y, m, d] = src.split("-");
  return { d: d ?? "01", m: m ?? "01", y: y ?? "2026" };
}

function fmtDataBr(iso: string): string {
  const { d, m, y } = parseDataIso(iso);
  return `${d}/${m}/${y}`;
}

function fmtDataFatura(iso: string): string {
  const { d, m, y } = parseDataIso(iso);
  return `${d}-${m}-${y}`;
}

function pdfParaBuffer(doc: PdfDoc): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

function strokeBox(doc: PdfDoc, x: number, y: number, w: number, h: number) {
  doc.rect(x, y, w, h).strokeColor("#000000").lineWidth(0.75).stroke();
}

function splitCol(doc: PdfDoc, x: number, y: number, w: number, h: number, ratio = 0.55) {
  const mid = x + w * ratio;
  doc.moveTo(mid, y).lineTo(mid, y + h).stroke();
}

function headerCell(
  doc: PdfDoc,
  text: string,
  x: number,
  y: number,
  w: number,
  opts?: { color?: string; bold?: boolean; align?: "left" | "center" | "right" },
) {
  doc
    .fontSize(8)
    .font(opts?.bold === false ? "Helvetica" : "Helvetica-Bold")
    .fillColor(opts?.color ?? "#000000")
    .text(text, x, y, { width: w, align: opts?.align ?? "left" });
}

function rowPar(doc: PdfDoc, label: string, valor: string, x: number, y: number, lw: number, vw: number) {
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#000000").text(label, x, y, { width: lw });
  doc.font("Helvetica").text(valor, x + lw, y, { width: vw, align: "right" });
}

function despesaValor(despesas: Despesa[], ...chaves: string[]): number {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  for (const d of despesas) {
    const n = norm(d.nome);
    if (chaves.some((k) => n.includes(norm(k)))) return d.valorBRL;
  }
  return 0;
}

function totaisRegime(resultado: ResultadoCotacao) {
  const e = resultado.entrada;
  const impostosSuspensos = e.iiTotal + e.ipiTotal + e.pisTotal + e.cofinsTotal;
  const totalIntegral = resultado.totalBRL;
  const totalEntreposto = Math.max(0, totalIntegral - impostosSuspensos);
  const proveitoEconomico = totalIntegral - totalEntreposto;
  return { totalIntegral, totalEntreposto, proveitoEconomico };
}

function descricaoMercadorias(itens: Item[]): string {
  if (itens.length === 0) return "—";
  const first = (itens[0]?.descPt || itens[0]?.descOriginal || "—").toUpperCase();
  if (itens.length === 1) return first;
  return `${first} (+ ${itens.length - 1} item(ns))`;
}

function ncmMercadorias(itens: Item[]): string {
  const ncms = [...new Set(itens.map((it) => formatNcm(it.ncm || "00000000")))];
  return ncms.slice(0, 3).join(" / ") + (ncms.length > 3 ? " …" : "");
}

function desenharFotosCertificacao(
  doc: PdfDoc,
  fotos: Buffer[],
  x: number,
  y: number,
  w: number,
  h: number,
) {
  if (fotos.length === 0) return;
  const pad = 4;
  const areaW = w - pad * 2;
  const areaH = h - pad * 2;

  if (fotos.length === 1) {
    try {
      doc.image(fotos[0]!, x + pad, y + pad, { fit: [areaW, areaH], align: "center", valign: "center" });
    } catch {
      /* formato inválido */
    }
    return;
  }

  const max = Math.min(fotos.length, 6);
  const cols = max <= 2 ? max : 3;
  const rows = Math.ceil(max / cols);
  const cellW = areaW / cols;
  const cellH = areaH / rows;

  for (let i = 0; i < max; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    try {
      doc.image(fotos[i]!, x + pad + col * cellW, y + pad + row * cellH, {
        fit: [cellW - 3, cellH - 3],
        align: "center",
        valign: "center",
      });
    } catch {
      /* skip */
    }
  }
}

export async function gerarPdfOrcamentoClienteModelo(payload: PayloadOrcamentoCliente): Promise<Buffer> {
  const { cotacao, itens, resultado } = payload;
  const criadoEm = payload.criadoEm ?? new Date().toISOString();
  const cambio = cotacao.cambio;
  const fobUS = resultado.entrada.fobTotalUS;
  const freteUS = cotacao.freteTotalUS ?? 0;
  const cifUS = fobUS + freteUS;
  const fobBRL = fobUS * cambio;
  const freteBRL = freteUS * cambio;
  const cifBRL = cifUS * cambio;
  const e = resultado.entrada;
  const s = resultado.saida;
  const despesas = cotacao.despesas ?? [];
  const { totalIntegral, totalEntreposto, proveitoEconomico } = totaisRegime(resultado);
  const pesoLiq = itens.reduce((acc, it) => acc + (it.pesoLiqKg > 0 ? it.pesoLiqKg : 0), 0);
  const pesoBruto = itens.reduce((acc, it) => acc + (it.pesoBrutoKg ?? 0), 0) || pesoLiq * 1.1;
  const porto = `PORTO ${cotacao.origem || "RJ"}`;
  const faturaTitulo = `${cotacao.cliente || "CLIENTE"} - ${fmtDataFatura(criadoEm)}`.toUpperCase();
  const [fotoMerc, fotosCert] = await Promise.all([primeiraFotoParaPdf(itens), fotosParaPdf(itens)]);

  const doc = new PDFDocument({
    size: "A4",
    margin: 36,
    info: { Title: `Fatura ${faturaTitulo}`, Author: "INNOVE 888" },
  });

  const pageW = 595.28;
  const m = 36;
  const contentW = pageW - m * 2;
  let y = m;

  try {
    doc.image(LOGO_PATH, m, y, { width: 118 });
  } catch {
    doc.fontSize(14).font("Helvetica-Bold").text("INNOVE\n888", m, y);
  }

  headerCell(doc, `FATURA: ${faturaTitulo}`, m + 130, y + 4, contentW - 130, { bold: true, align: "right" });
  y += 52;

  const barH = 18;
  strokeBox(doc, m, y, contentW, barH);
  headerCell(doc, `DATA: ${fmtDataBr(criadoEm)}`, m + 6, y + 5, contentW * 0.33);
  headerCell(doc, porto, m + contentW * 0.28, y + 5, contentW * 0.4, { color: "#1d4ed8", align: "center" });
  headerCell(doc, "ESTIMATIVA", m + contentW * 0.68, y + 5, contentW * 0.28, { color: "#dc2626", align: "right" });
  y += barH + 6;

  const b1h = 58;
  strokeBox(doc, m, y, contentW, b1h);
  headerCell(doc, `TAXA DOLLAR: $ ${fmtUsd(cambio)}`, m + 6, y + 4, contentW - 12, { bold: true });
  const tY = y + 20;
  const c1 = m + 6;
  const cUsd = m + contentW * 0.42;
  const cBrl = m + contentW * 0.68;
  doc.fontSize(7.5).font("Helvetica-Bold");
  doc.text("VALOR FOB DI", c1, tY);
  doc.text("FRETE PREPAID", c1, tY + 13);
  doc.text("VALOR CIF", c1, tY + 26);
  doc.font("Helvetica");
  doc.text(`$ ${fmtUsd(fobUS)}`, cUsd, tY, { width: contentW * 0.22, align: "right" });
  doc.text(`$ ${fmtUsd(freteUS)}`, cUsd, tY + 13, { width: contentW * 0.22, align: "right" });
  doc.text(`$ ${fmtUsd(cifUS)}`, cUsd, tY + 26, { width: contentW * 0.22, align: "right" });
  doc.text(`R$ ${fmtBrl(fobBRL)}`, cBrl, tY, { width: contentW * 0.28, align: "right" });
  doc.text(`R$ ${fmtBrl(freteBRL)}`, cBrl, tY + 13, { width: contentW * 0.28, align: "right" });
  doc.text(`R$ ${fmtBrl(cifBRL)}`, cBrl, tY + 26, { width: contentW * 0.28, align: "right" });
  y += b1h + 6;

  const b2h = 118;
  strokeBox(doc, m, y, contentW, b2h);
  splitCol(doc, m, y, contentW, b2h, 0.52);
  headerCell(doc, "IMPOSTOS DE ENTRADA", m + 6, y + 4, contentW * 0.45);
  headerCell(doc, "MERCADORIAS NCM", m + contentW * 0.54, y + 4, contentW * 0.42);
  let ly = y + 18;
  const lx = m + 6;
  const lv = m + contentW * 0.28;
  const impostosEntrada: [string, number][] = [
    ["II", e.iiTotal],
    ["IPI", e.ipiTotal],
    ["PIS", e.pisTotal],
    ["COFINS", e.cofinsTotal],
    ["TAXA SISC", e.siscomex],
    ["ANTIDUMPING", e.antidumpingBRL],
  ];
  for (const [lab, val] of impostosEntrada) {
    rowPar(doc, `${lab}:`, `R$ ${fmtBrl(val)}`, lx, ly, 72, lv - lx);
    ly += 11;
  }
  const rx = m + contentW * 0.54;
  doc.fontSize(8).font("Helvetica-Bold").text(descricaoMercadorias(itens), rx, y + 22, { width: contentW * 0.4 });
  doc.fontSize(8).font("Helvetica").text(`NCM: ${ncmMercadorias(itens)}`, rx, y + 48, { width: contentW * 0.4 });
  const fotoMercResolved = fotoMerc;
  if (fotoMerc) {
    try {
      doc.image(fotoMerc, rx, y + 62, {
        fit: [contentW * 0.18, 36],
      });
    } catch {
      /* skip */
    }
  }
  y += b2h + 6;

  const b3h = 148;
  strokeBox(doc, m, y, contentW, b3h);
  splitCol(doc, m, y, contentW, b3h, 0.52);
  headerCell(doc, "TAXAS LOCAIS", m + 6, y + 4, contentW * 0.45);
  headerCell(doc, "CERTIFICAÇÃO", m + contentW * 0.54, y + 4, contentW * 0.42);
  ly = y + 18;
  const taxasLocais: [string, number][] = [
    ["AFRMM", despesaValor(despesas, "afrmm")],
    ["ARMAZENAGEM", despesaValor(despesas, "armazenagem")],
    ["LIBERAÇÃO BL", despesaValor(despesas, "liberação", "bl")],
    ["GNRE", despesaValor(despesas, "gnre")],
    ["ADMINISTRATIVO", despesaValor(despesas, "administrativo")],
    ["TRANSP+ESC DTA", despesaValor(despesas, "transp", "dta")],
    [`TRANSPORTE ${cotacao.destino}`, despesaValor(despesas, "transporte")],
    [`ESCOLTA ${cotacao.destino}`, despesaValor(despesas, "escolta")],
    ["DESPACHO HON", despesaValor(despesas, "despacho", "honor")],
    ["PROVEITO ECONÔMICO", s.markup],
  ];
  for (const [lab, val] of taxasLocais) {
    rowPar(doc, `${lab}:`, `R$ ${fmtBrl(val)}`, lx, ly, 100, lv - lx - 4);
    ly += 11;
  }
  const pctMarkup = `${(cotacao.params.markupPct * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  const certX = m + contentW * 0.54;
  if (fotosCert.length > 0) {
    desenharFotosCertificacao(doc, fotosCert, certX, y + 16, contentW * 0.42, b3h - 28);
  }
  doc
    .fontSize(9)
    .font("Helvetica-Bold")
    .text(pctMarkup, certX, y + b3h - 22, { width: contentW * 0.4, align: "right" });
  y += b3h + 6;

  const b4h = 108;
  strokeBox(doc, m, y, contentW, b4h);
  splitCol(doc, m, y, contentW, b4h, 0.52);
  headerCell(doc, "IMPOSTOS DE SAIDA", m + 6, y + 4, contentW * 0.45);
  headerCell(doc, "OUTRAS INFORMAÇÕES", m + contentW * 0.54, y + 4, contentW * 0.42);
  ly = y + 18;
  const impostosSaida: [string, number][] = [
    ["DIF IPI", s.difIPI],
    ["DIF PIS", s.difPIS],
    ["DIF COFINS", s.difCOFINS],
    ["ICMS SAIDA", s.icmsSaida],
    ["CSLL", s.csll],
    ["IRRF", s.irrf],
    ["MARKUP", s.markup],
  ];
  for (const [lab, val] of impostosSaida) {
    rowPar(doc, `${lab}:`, `R$ ${fmtBrl(val)}`, lx, ly, 72, lv - lx);
    ly += 11;
  }
  doc.fontSize(7.5).font("Helvetica-Bold").text(`GROSS WEIGHT: ${fmtBrl(pesoBruto)}`, rx, y + 22);
  doc.text(`NET WEIGHT: ${fmtBrl(pesoLiq)}`, rx, y + 36);
  doc.text("CAIXAS:", rx, y + 50);
  y += b4h + 8;

  const totais: [number, string][] = [
    [totalIntegral, "VALOR DAS DESPESAS + IMPOSTOS REGIME INTEGRAL"],
    [totalEntreposto, "VALOR DAS DESPESAS - ENTREPOSTO ADUANEIRO SUSPENSOS"],
    [proveitoEconomico, "VALOR DO PROVEITO ECONÔMICO C/ENTREPOSTO ADUANEIRO"],
  ];
  for (const [valBrl, legenda] of totais) {
    const valUsd = cambio > 0 ? valBrl / cambio : 0;
    const th = 22;
    strokeBox(doc, m, y, contentW, th);
    doc.moveTo(m + contentW * 0.32, y).lineTo(m + contentW * 0.32, y + th).stroke();
    doc.moveTo(m + contentW * 0.48, y).lineTo(m + contentW * 0.48, y + th).stroke();
    headerCell(doc, `TOTAL R$ ${fmtBrl(valBrl)}`, m + 6, y + 6, contentW * 0.28);
    headerCell(doc, `$ ${fmtUsd(valUsd)}`, m + contentW * 0.34, y + 6, contentW * 0.12, { align: "center" });
    headerCell(doc, legenda, m + contentW * 0.5, y + 6, contentW * 0.48, { bold: false, align: "right" });
    y += th + 3;
  }

  y += 4;
  doc
    .fontSize(7)
    .font("Helvetica-Bold")
    .fillColor("#000000")
    .text(
      "OBS: NO ATO DA NACIONALIZAÇÃO PODEREMOS PLEITEAR O USO DE UM E-TARIFÁRIO E REDUZIR O II PARA R$ 0,00",
      m,
      y,
      { width: contentW, align: "left" },
    );

  return pdfParaBuffer(doc);
}
