/** Geração de PDF — orçamento cliente (comercial) e relatório estratégico (trade). */

import PDFDocument from "pdfkit";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao, Item } from "@cia/shared";
import { formatNcm } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import type { buscarCotacao } from "./cotacoes-persist.js";

type CotacaoSalva = NonNullable<Awaited<ReturnType<typeof buscarCotacao>>>;

export type PayloadPdf = {
  cotacao: Cotacao;
  itens: Item[];
  resultado: ResultadoCotacao | null;
  criadoEm?: string;
  financeiro?: CotacaoSalva["financeiro"];
};

type PdfDoc = InstanceType<typeof PDFDocument>;

export type TipoPdf = "cliente" | "trade";

function brl(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function pct(frac: number): string {
  return `${(frac * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
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

function titulo(doc: PdfDoc, texto: string) {
  doc.fontSize(16).fillColor("#1e3a5f").text(texto, { align: "left" });
  doc.moveDown(0.3);
  doc.strokeColor("#3b82f6").lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor("#000000");
}

function linha(doc: PdfDoc, label: string, valor: string, bold = false) {
  doc.fontSize(10).font(bold ? "Helvetica-Bold" : "Helvetica");
  doc.text(`${label}: `, { continued: true }).font("Helvetica-Bold").text(valor);
}

function fobKgValor(it: Item): number | null {
  if (it.calibracao?.fobKgCalibrado) return it.calibracao.fobKgCalibrado;
  if (it.pesoLiqKg > 0 && it.fobTotalUS > 0) return it.fobTotalUS / it.pesoLiqKg;
  return null;
}

function usdKg(n: number | null): string {
  if (n == null) return "—";
  return `US$ ${n.toFixed(4)}/kg`;
}

function gerarPdfCliente(payload: PayloadPdf): Promise<Buffer> {
  const { cotacao, itens, resultado } = payload;
  const criadoEm = payload.criadoEm ?? new Date().toISOString();
  const financeiro =
    payload.financeiro ?? extrairResumoFinanceiro(resultado, cotacao.params.markupPct);
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: "Orçamento de Importação" } });

  const empresa = cotacao.empresaTrade?.trim() || "CIA / Alpha 44";
  const fobTotalUS = itens.reduce((s, it) => s + (it.fobTotalUS > 0 ? it.fobTotalUS : 0), 0);
  const pesoTotalKg = itens.reduce((s, it) => s + (it.pesoLiqKg > 0 ? it.pesoLiqKg : 0), 0);

  titulo(doc, "ORÇAMENTO DE IMPORTAÇÃO");
  doc.fontSize(11).font("Helvetica-Bold").text(empresa);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Cliente: ${cotacao.cliente || "—"}`);
  doc.text(
    `Data: ${fmtData(criadoEm)} · Destino: ${cotacao.destino} · Incoterm: ${cotacao.incoterm} · Câmbio ref.: R$ ${cotacao.cambio.toFixed(4)}`,
  );
  doc.moveDown(1);

  doc.fontSize(11).font("Helvetica-Bold").text("Itens cotados");
  doc.moveDown(0.4);
  doc.fontSize(8).font("Helvetica-Bold");
  const cols = { num: 50, desc: 68, ncm: 248, qtd: 318, peso: 358, fobKg: 408, fob: 478 };
  const headerY = doc.y;
  doc.text("#", cols.num, headerY);
  doc.text("Descrição", cols.desc, headerY, { width: 170 });
  doc.text("NCM", cols.ncm, headerY);
  doc.text("Qtd", cols.qtd, headerY);
  doc.text("Peso", cols.peso, headerY);
  doc.text("US$/kg", cols.fobKg, headerY);
  doc.text("FOB US$", cols.fob, headerY);
  doc.moveDown(0.3);
  doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.35);

  itens.forEach((it, idx) => {
    if (doc.y > 700) doc.addPage();
    const y = doc.y;
    doc.font("Helvetica").fontSize(8);
    doc.text(String(idx + 1), cols.num, y);
    doc.text((it.descPt || it.descOriginal).slice(0, 55), cols.desc, y, { width: 170 });
    doc.text(formatNcm(it.ncm || "00000000"), cols.ncm, y);
    doc.text(it.qtd != null ? String(it.qtd) : "—", cols.qtd, y);
    doc.text(it.pesoLiqKg > 0 ? it.pesoLiqKg.toLocaleString("pt-BR") : "—", cols.peso, y);
    doc.text(usdKg(fobKgValor(it)), cols.fobKg, y);
    doc.text(it.fobTotalUS > 0 ? it.fobTotalUS.toFixed(2) : "—", cols.fob, y);
    doc.moveDown(0.85);
  });

  doc.moveDown(0.3);
  doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.4);
  doc.fontSize(8).font("Helvetica-Bold");
  doc.text("Totais", cols.desc, doc.y);
  doc.text(pesoTotalKg > 0 ? pesoTotalKg.toLocaleString("pt-BR") : "—", cols.peso, doc.y);
  doc.text(`US$ ${fobTotalUS.toFixed(2)}`, cols.fob, doc.y);
  doc.moveDown(1);

  doc.fontSize(10).font("Helvetica").fillColor("#000000");
  doc.text(`FOB total mercadorias: US$ ${fobTotalUS.toFixed(2)}`);
  doc.text(`Câmbio de referência: R$ ${cotacao.cambio.toFixed(4)}`);
  doc.fontSize(9).fillColor("#444444");
  doc.text(`Inclui nacionalização, impostos, despesas locais e entrega até ${cotacao.destino}.`);
  doc.moveDown(0.8);
  doc.fontSize(12).font("Helvetica-Bold").fillColor("#1e3a5f");
  doc.text(`Investimento total estimado: ${financeiro ? brl(financeiro.totalOrcamentoBRL) : "—"}`, {
    align: "right",
  });
  doc.fillColor("#000000").font("Helvetica").fontSize(9);
  doc.moveDown(1.5);
  doc.text("Condições gerais:", { underline: true });
  doc.moveDown(0.3);
  doc.text("• Valores em Reais (BRL), sujeitos a variação cambial até fechamento.");
  doc.text("• Validade desta proposta: 15 dias corridos.");
  doc.text("• Impostos e taxas conforme legislação vigente na data do desembarque.");
  doc.text("• Carga ainda não inspecionada — sujeita a conferência aduaneira.");
  doc.moveDown(2);
  doc.fontSize(8).fillColor("#666666").text(`${empresa} · Gerado por CIA / Alpha 44`, { align: "center" });

  return pdfParaBuffer(doc);
}

function gerarPdfTrade(payload: PayloadPdf): Promise<Buffer> {
  const { cotacao, itens, resultado } = payload;
  const criadoEm = payload.criadoEm ?? new Date().toISOString();
  const f = payload.financeiro ?? extrairResumoFinanceiro(resultado, cotacao.params.markupPct);
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: "Relatório Estratégico — Trade" } });

  titulo(doc, "RELATÓRIO ESTRATÉGICO — TRADE");
  doc.fontSize(10).font("Helvetica");
  linha(doc, "Empresa trade", cotacao.empresaTrade || "—");
  linha(doc, "Cliente final", cotacao.cliente || "—");
  linha(doc, "Rota", `${cotacao.origem} → ${cotacao.destino}`);
  linha(doc, "Benefício fiscal", cotacao.benefFiscal);
  linha(doc, "Markup", pct(cotacao.params.markupPct));
  linha(doc, "ICMS saída", pct(cotacao.params.icmsSaida));
  linha(doc, "Data", fmtData(criadoEm));
  doc.moveDown(1);

  if (f) {
    doc.fontSize(11).font("Helvetica-Bold").text("Resumo financeiro");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");
    linha(doc, "Custo importação (fixo)", brl(f.custoImportacaoBRL));
    linha(doc, "Impostos venda", brl(f.impostosSaidaBRL));
    linha(doc, "Lucro trade (markup bruto)", brl(f.markupBRL));
    linha(doc, "Lucro líquido trade", brl(f.lucroLiquidoTradeBRL));
    linha(doc, "Total orçamento", brl(f.totalOrcamentoBRL), true);
    doc.moveDown(0.5);
    doc.text(`${brl(f.custoImportacaoBRL)} + ${brl(f.impostosSaidaBRL)} + ${brl(f.markupBRL)} = ${brl(f.totalOrcamentoBRL)}`, {
      align: "center",
    });
    doc.moveDown(1);
  }

  if (resultado) {
    doc.fontSize(11).font("Helvetica-Bold").text("Breakdown impostos de venda");
    doc.moveDown(0.4);
    doc.fontSize(10).font("Helvetica");
    linha(doc, "ICMS saída", brl(resultado.saida.icmsSaida));
    linha(doc, "DIF IPI", brl(resultado.saida.difIPI));
    linha(doc, "DIF PIS", brl(resultado.saida.difPIS));
    linha(doc, "DIF COFINS", brl(resultado.saida.difCOFINS));
    linha(doc, "CSLL", brl(resultado.saida.csll));
    linha(doc, "IRRF", brl(resultado.saida.irrf));
    doc.moveDown(1);
  }

  doc.fontSize(11).font("Helvetica-Bold").text("Itens — risco e FOB");
  doc.moveDown(0.4);
  for (const it of itens) {
    if (doc.y > 720) doc.addPage();
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text((it.descPt || it.descOriginal).slice(0, 90));
    doc.font("Helvetica");
    const canal = it.risco?.canal?.replace(/_/g, " ") ?? "—";
    const fobKg = fobKgValor(it);
    doc.text(
      `NCM ${formatNcm(it.ncm)} · FOB US$ ${it.fobTotalUS.toFixed(2)} · ${usdKg(fobKg)} · Canal ${canal} · Peso ${it.pesoLiqKg} kg`,
    );
    if (it.benchmark?.mediaFobKg != null) {
      doc.text(`Benchmark: US$/kg ${it.benchmark.mediaFobKg.toFixed(4)} (${it.benchmark.fonte})`);
    }
    doc.moveDown(0.6);
  }

  if (cotacao.despesas?.length) {
    doc.moveDown(0.5);
    doc.fontSize(11).font("Helvetica-Bold").text("Despesas locais");
    doc.moveDown(0.3);
    doc.fontSize(9).font("Helvetica");
    for (const d of cotacao.despesas) {
      if (d.valorBRL > 0) linha(doc, d.nome, brl(d.valorBRL));
    }
  }

  doc.moveDown(2);
  doc.fontSize(8).fillColor("#666666").text("Documento interno — não enviar ao cliente final.", { align: "center" });

  return pdfParaBuffer(doc);
}

function salvaParaPayload(salva: CotacaoSalva): PayloadPdf {
  return {
    cotacao: salva.cotacao,
    itens: salva.itens,
    resultado: salva.resultado,
    criadoEm: salva.criadoEm,
    financeiro: salva.financeiro,
  };
}

export async function gerarPdfCotacao(salva: CotacaoSalva, tipo: TipoPdf): Promise<Buffer> {
  return gerarPdfFromPayload(salvaParaPayload(salva), tipo);
}

export async function gerarPdfFromPayload(payload: PayloadPdf, tipo: TipoPdf): Promise<Buffer> {
  if (!payload.resultado && tipo === "trade") {
    throw new Error("Cotação sem resultado fiscal — recalcule antes de gerar o PDF.");
  }
  return tipo === "trade" ? gerarPdfTrade(payload) : gerarPdfCliente(payload);
}
