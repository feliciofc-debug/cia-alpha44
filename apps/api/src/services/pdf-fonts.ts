/** Fonte Unicode (CJK) para PDFKit — Helvetica não renderiza chinês. */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type PDFDocument from "pdfkit";

type PdfDoc = InstanceType<typeof PDFDocument>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const FONT_UNICODE_PATH = path.join(__dirname, "..", "assets", "NotoSansCJKsc-Regular.otf");
export const FONT_UNICODE = "NotoSansSC";

export function fonteUnicodeDisponivel(): boolean {
  return fs.existsSync(FONT_UNICODE_PATH);
}

export function registrarFontesPdf(doc: PdfDoc): void {
  if (!fonteUnicodeDisponivel()) return;
  doc.registerFont(FONT_UNICODE, FONT_UNICODE_PATH);
}

export function temTextoUnicode(texto: string): boolean {
  return /[^\u0000-\u007F]/.test(texto);
}

export function fonteParaTexto(texto: string, bold = false): string {
  if (temTextoUnicode(texto) && fonteUnicodeDisponivel()) return FONT_UNICODE;
  return bold ? "Helvetica-Bold" : "Helvetica";
}

export function tituloFatura(cliente: string, criadoEm: string, fmtData: (iso: string) => string): string {
  const data = fmtData(criadoEm);
  const nome = (cliente || "CLIENTE").trim();
  if (temTextoUnicode(nome)) return `${nome} - ${data}`;
  return `${nome} - ${data}`.toUpperCase();
}

export function textoPdf(
  doc: PdfDoc,
  texto: string,
  x: number,
  y: number,
  w: number,
  opts?: { fontSize?: number; bold?: boolean; color?: string; align?: "left" | "center" | "right" },
) {
  doc
    .fontSize(opts?.fontSize ?? 8)
    .font(fonteParaTexto(texto, opts?.bold !== false))
    .fillColor(opts?.color ?? "#000000")
    .text(texto, x, y, { width: w, align: opts?.align ?? "left" });
}
