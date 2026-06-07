/**
 * Imagens em planilhas WPS / Excel antigo (.xls OLE) — fórmulas DISPIMG + stream ETCellImageData.
 * Comum em 装箱单出货清单 e listas chinesas de fornecedor.
 */

import CFB from "cfb";
import * as XLSX from "xlsx";

export interface ImagemBinaria {
  buffer: Buffer;
  mime: string;
}

export function isOleXls(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0;
}

export function isZipXlsx(buf: Buffer): boolean {
  return buf.length > 2 && buf[0] === 0x50 && buf[1] === 0x4b;
}

function extractPngAt(data: Buffer, offset: number): Buffer | null {
  if (offset + 8 > data.length) return null;
  if (data[offset] !== 0x89 || data[offset + 1] !== 0x50) return null;

  let pos = offset + 8;
  while (pos + 12 <= data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.subarray(pos + 4, pos + 8).toString("ascii");
    pos += 8 + len + 4;
    if (type === "IEND") break;
    if (len > 50_000_000) break;
  }
  return data.subarray(offset, pos);
}

function extractJpegAt(data: Buffer, offset: number): Buffer | null {
  if (offset + 3 > data.length) return null;
  if (data[offset] !== 0xff || data[offset + 1] !== 0xd8) return null;

  let end = offset + 2;
  while (end + 1 < data.length) {
    if (data[end] === 0xff && data[end + 1] === 0xd9) {
      end += 2;
      break;
    }
    end++;
    if (end - offset > 20_000_000) break;
  }
  return data.subarray(offset, end);
}

/** Extrai blobs PNG/JPEG do stream ETCellImageData (WPS). */
export function extrairImagensWpsOle(buf: Buffer): ImagemBinaria[] {
  if (!isOleXls(buf)) return [];

  let cfb: CFB.CFB$Container;
  try {
    cfb = CFB.read(buf, { type: "buffer" });
  } catch {
    return [];
  }

  const entry =
    CFB.find(cfb, "Root Entry/ETCellImageData") ??
    CFB.find(cfb, "Root Entry/CellImageData") ??
    CFB.find(cfb, "Root Entry/ETCellImages");

  if (!entry?.content?.length) return [];

  const data = Buffer.from(entry.content);
  const pngOffsets: number[] = [];
  const jpgOffsets: number[] = [];

  for (let i = 0; i < data.length - 8; i++) {
    if (data[i] === 0x89 && data[i + 1] === 0x50 && data[i + 2] === 0x4e && data[i + 3] === 0x47) {
      pngOffsets.push(i);
    } else if (data[i] === 0xff && data[i + 1] === 0xd8 && data[i + 2] === 0xff) {
      jpgOffsets.push(i);
    }
  }

  const out: ImagemBinaria[] = [];
  for (const offset of pngOffsets) {
    const png = extractPngAt(data, offset);
    if (png && png.length > 100) out.push({ buffer: png, mime: "image/png" });
  }
  for (const offset of jpgOffsets) {
    const jpg = extractJpegAt(data, offset);
    if (jpg && jpg.length > 100) out.push({ buffer: jpg, mime: "image/jpeg" });
  }

  return out;
}

/** Linha Excel 1-based → índice da imagem (ordem das células DISPIMG). */
export function mapDispimgLinhas(ws: XLSX.WorkSheet): Map<number, number> {
  const map = new Map<number, number>();
  const ref = ws["!ref"];
  if (!ref) return map;

  const range = XLSX.utils.decode_range(ref);
  let idx = 0;

  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[addr] as { f?: string; v?: unknown } | undefined;
      const raw = cell?.f ?? cell?.v ?? "";
      if (String(raw).includes("DISPIMG")) {
        map.set(R + 1, idx++);
      }
    }
  }

  return map;
}
