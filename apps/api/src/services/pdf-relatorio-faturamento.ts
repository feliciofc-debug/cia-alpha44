/** PDF — relatório de faturamento mensal e anual. */

import PDFDocument from "pdfkit";
import type { RelatorioFaturamento } from "./dashboard-relatorio.js";

type PdfDoc = InstanceType<typeof PDFDocument>;

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
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

const MESES_LONGO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function gerarPdfRelatorioFaturamento(rel: RelatorioFaturamento): Promise<Buffer> {
  const titulo = rel.tipo === "mensal" ? "RELATÓRIO MENSAL DE FATURAMENTO" : "RELATÓRIO ANUAL DE FATURAMENTO";
  const doc = new PDFDocument({ size: "A4", margin: 50, info: { Title: titulo } });

  doc.fontSize(16).fillColor("#1e3a5f").text(titulo);
  doc.moveDown(0.3);
  doc.strokeColor("#3b82f6").lineWidth(2).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.8);
  doc.fillColor("#000000").fontSize(11).font("Helvetica-Bold").text(rel.empresa);
  doc.font("Helvetica").fontSize(10);
  doc.text(`Período: ${rel.periodoLabel}`);
  doc.text(`Gerado em: ${fmtData(rel.geradoEm)}`);
  doc.moveDown(1);

  doc.fontSize(11).font("Helvetica-Bold").text("Resumo do período");
  doc.moveDown(0.4);
  doc.fontSize(10).font("Helvetica");
  doc.text(`Processos de importação: ${rel.totais.processos}`);
  doc.text(`Volume orçado (faturamento bruto): ${brl(rel.totais.volumeBRL)}`);
  doc.text(`Receita trade (markup bruto): ${brl(rel.totais.lucroTradeBRL)}`);
  doc.text(`Lucro líquido trade (estimado): ${brl(rel.totais.lucroLiquidoBRL)}`);
  doc.text(`Ticket médio por processo: ${brl(rel.totais.ticketMedioBRL)}`);
  doc.moveDown(1);

  if (rel.tipo === "anual") {
    doc.fontSize(11).font("Helvetica-Bold").text("Faturamento mês a mês");
    doc.moveDown(0.4);
    doc.fontSize(8).font("Helvetica-Bold");
    const y0 = doc.y;
    doc.text("Mês", 50, y0);
    doc.text("Processos", 130, y0);
    doc.text("Volume orçado", 200, y0);
    doc.text("Receita trade", 310, y0);
    doc.text("Lucro líquido", 420, y0);
    doc.moveDown(0.35);
    doc.strokeColor("#cccccc").lineWidth(0.5).moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    for (const m of rel.meses) {
      if (doc.y > 700) doc.addPage();
      const y = doc.y;
      doc.font("Helvetica").fontSize(8);
      doc.text(MESES_LONGO[m.mesNum - 1] ?? m.label, 50, y);
      doc.text(String(m.processos), 130, y);
      doc.text(brl(m.volumeBRL), 200, y);
      doc.text(brl(m.lucroTradeBRL), 310, y);
      doc.text(brl(m.lucroLiquidoBRL), 420, y);
      doc.moveDown(0.75);
    }

    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").fontSize(9);
    doc.text(`TOTAL ${rel.ano}`, 50, doc.y);
    doc.text(String(rel.totais.processos), 130, doc.y);
    doc.text(brl(rel.totais.volumeBRL), 200, doc.y);
    doc.text(brl(rel.totais.lucroTradeBRL), 310, doc.y);
    doc.text(brl(rel.totais.lucroLiquidoBRL), 420, doc.y);
    doc.moveDown(1);
  }

  if (rel.processos.length > 0) {
    doc.fontSize(11).font("Helvetica-Bold").text(
      rel.tipo === "mensal" ? "Detalhamento por processo" : "Processos do exercício",
    );
    doc.moveDown(0.4);
    for (const p of rel.processos) {
      if (doc.y > 720) doc.addPage();
      doc.fontSize(9).font("Helvetica");
      doc.text(
        `${fmtData(p.criadoEm)} · ${p.cliente.slice(0, 40)} · ${p.destino} · Orçamento ${brl(p.totalBRL)} · Trade ${brl(p.lucroTradeBRL)}`,
      );
      doc.moveDown(0.45);
    }
  }

  doc.moveDown(1.5);
  doc.fontSize(8).fillColor("#666666");
  doc.text(
    "Documento gerado pelo CIA / Alpha 44 para controle interno e envio ao contador. Valores baseados em cotações salvas no sistema.",
    { align: "center" },
  );
  doc.text("Volume orçado = soma dos totais de orçamento emitidos aos clientes no período.", { align: "center" });

  return pdfParaBuffer(doc);
}
