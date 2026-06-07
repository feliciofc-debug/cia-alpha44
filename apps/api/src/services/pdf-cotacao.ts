/** Geração de PDF — orçamento cliente (comercial) e relatório estratégico (trade). */

import PDFDocument from "pdfkit";
import type { ResultadoCotacao } from "@cia/fiscal-engine";
import type { Cotacao, Item } from "@cia/shared";
import { formatNcm } from "@cia/shared";
import { extrairResumoFinanceiro } from "../lib/financeiro.js";
import { gerarPdfOrcamentoClienteModelo } from "./pdf-orcamento-cliente.js";
import { itensComFotosCarregadas } from "./fotos.js";
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
  if (!payload.resultado) {
    throw new Error("Cotação sem resultado fiscal — recalcule antes de gerar o PDF do cliente.");
  }
  return gerarPdfOrcamentoClienteModelo({
    cotacao: payload.cotacao,
    itens: payload.itens,
    resultado: payload.resultado,
    criadoEm: payload.criadoEm,
  });
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
  const itens = await itensComFotosCarregadas(salva.itens);
  return gerarPdfFromPayload({ ...salvaParaPayload(salva), itens }, tipo);
}

export async function gerarPdfFromPayload(payload: PayloadPdf, tipo: TipoPdf): Promise<Buffer> {
  if (!payload.resultado && tipo === "trade") {
    throw new Error("Cotação sem resultado fiscal — recalcule antes de gerar o PDF.");
  }
  const itens =
    tipo === "cliente" && payload.itens.some((it) => it.fotoPath && !it.fotoBase64)
      ? await itensComFotosCarregadas(payload.itens)
      : payload.itens;
  const enriched = { ...payload, itens };
  return tipo === "trade" ? gerarPdfTrade(enriched) : gerarPdfCliente(enriched);
}
