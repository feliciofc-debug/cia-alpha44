/**
 * Extrai imagens embutidas de planilhas .xlsx (coluna 产品图片 / product image).
 * Estratégias: exceljs (anchors) → ZIP xl/media + drawing XML → ordem 1:1.
 */

import ExcelJS from "exceljs";
import JSZip from "jszip";

export interface FotoPlanilha {
  /** Linha Excel 1-based (0 = associar só por ordem). */
  linhaExcel: number;
  buffer: Buffer;
  mime: string;
}

function mimePorExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (e === "png") return "image/png";
  if (e === "gif") return "image/gif";
  if (e === "webp") return "image/webp";
  return "image/jpeg";
}

function sortMediaNames(names: string[]): string[] {
  return names.sort((a, b) => {
    const na = Number(a.match(/image(\d+)/i)?.[1] ?? 0);
    const nb = Number(b.match(/image(\d+)/i)?.[1] ?? 0);
    return na - nb;
  });
}

async function extrairViaExcelJs(buf: Buffer): Promise<Map<number, FotoPlanilha>> {
  const map = new Map<number, FotoPlanilha>();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

  for (const ws of wb.worksheets) {
    const images = ws.getImages?.() ?? [];
    for (const meta of images) {
      const rawId = meta.imageId;
      const id = typeof rawId === "string" ? Number.parseInt(rawId, 10) : Number(rawId);
      if (!Number.isFinite(id)) continue;

      const img = wb.getImage(id);
      const raw = img?.buffer;
      if (!raw) continue;
      const imgBuffer = Buffer.isBuffer(raw) ? raw : Buffer.from(new Uint8Array(raw as unknown as ArrayBuffer));
      if (imgBuffer.length === 0) continue;

      const nativeRow = meta.range?.tl?.nativeRow;
      if (nativeRow == null || nativeRow < 0) continue;

      const linhaExcel = nativeRow + 1;
      if (map.has(linhaExcel)) continue;

      map.set(linhaExcel, {
        linhaExcel,
        buffer: imgBuffer,
        mime: mimePorExt(img.extension || "jpeg"),
      });
    }
  }

  return map;
}

async function extrairViaZip(buf: Buffer): Promise<{ map: Map<number, FotoPlanilha>; mediaCount: number }> {
  const map = new Map<number, FotoPlanilha>();
  const zip = await JSZip.loadAsync(buf);

  const mediaNames = sortMediaNames(
    Object.keys(zip.files).filter((n) => /^xl\/media\/image\d+\.(png|jpe?g|gif|webp)$/i.test(n)),
  );

  if (mediaNames.length === 0) {
    return { map, mediaCount: 0 };
  }

  const drawingRows: number[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!/^xl\/drawings\/drawing\d+\.xml$/i.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    const re = /<xdr:from>[\s\S]*?<xdr:row>(\d+)<\/xdr:row>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(xml))) {
      drawingRows.push(Number(m[1]) + 1);
    }
  }

  const fotos: FotoPlanilha[] = [];
  for (const name of mediaNames) {
    const buffer = Buffer.from(await zip.file(name)!.async("arraybuffer"));
    const ext = name.split(".").pop() ?? "jpeg";
    fotos.push({ linhaExcel: 0, buffer, mime: mimePorExt(ext) });
  }

  if (drawingRows.length === fotos.length) {
    for (let i = 0; i < fotos.length; i++) {
      const linha = drawingRows[i]!;
      map.set(linha, { ...fotos[i]!, linhaExcel: linha });
    }
    return { map, mediaCount: fotos.length };
  }

  /** Fallback: ordem das imagens = ordem das linhas de item (comum em planilhas chinesas). */
  for (let i = 0; i < fotos.length; i++) {
    map.set(-(i + 1), { ...fotos[i]!, linhaExcel: 0 });
  }

  return { map, mediaCount: fotos.length };
}

/** Mapa linha Excel → foto (ou chaves negativas = ordem 1:1). */
export async function extrairFotosXlsx(
  buffer: Buffer | ArrayBuffer | Uint8Array,
): Promise<{ fotos: Map<number, FotoPlanilha>; mediaCount: number }> {
  const buf: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));
  let mediaCount = 0;

  try {
    const excelMap = await extrairViaExcelJs(buf);
    if (excelMap.size > 0) {
      return { fotos: excelMap, mediaCount: excelMap.size };
    }
  } catch {
    /* exceljs indisponível ou arquivo corrompido */
  }

  try {
    const zipOut = await extrairViaZip(buf);
    mediaCount = zipOut.mediaCount;
    return { fotos: zipOut.map, mediaCount };
  } catch {
    return { fotos: new Map(), mediaCount: 0 };
  }
}

/** Associa fotos às linhas de item (match por linha, ordem 1:1 ou proximidade). */
export function associarFotosLinhas<T extends { linha: number }>(
  linhas: T[],
  fotos: Map<number, FotoPlanilha>,
): (T & { fotoBase64?: string; fotoMime?: string })[] {
  if (linhas.length === 0 || fotos.size === 0) {
    return linhas;
  }

  const orderKeys = [...fotos.keys()].filter((k) => k < 0).sort((a, b) => b - a);
  if (orderKeys.length > 0) {
    const max = Math.min(orderKeys.length, linhas.length);
    return linhas.map((lin, idx) => {
      if (idx >= max) return lin;
      const foto = fotos.get(orderKeys[idx]!);
      if (!foto) return lin;
      return {
        ...lin,
        fotoBase64: foto.buffer.toString("base64"),
        fotoMime: foto.mime,
      };
    });
  }

  const rowsImg = [...fotos.keys()].sort((a, b) => a - b);
  const porOrdem =
    rowsImg.length === linhas.length &&
    linhas.every((l, i) => Math.abs(l.linha - rowsImg[i]!) <= 3);

  return linhas.map((lin, idx) => {
    let foto: FotoPlanilha | undefined;

    if (porOrdem) {
      foto = fotos.get(rowsImg[idx]!);
    } else {
      foto =
        fotos.get(lin.linha) ??
        fotos.get(lin.linha - 1) ??
        fotos.get(lin.linha + 1) ??
        fotos.get(lin.linha - 2) ??
        fotos.get(lin.linha + 2);
    }

    if (!foto) return lin;
    return {
      ...lin,
      fotoBase64: foto.buffer.toString("base64"),
      fotoMime: foto.mime,
    };
  });
}
