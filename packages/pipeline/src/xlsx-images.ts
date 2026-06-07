/**
 * Extrai imagens embutidas de planilhas .xlsx (coluna 产品图片 / product image).
 * Usa exceljs — SheetJS (xlsx) não lê mídia embutida.
 */

import ExcelJS from "exceljs";

export interface FotoPlanilha {
  /** Linha Excel 1-based (anchor top-left). */
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

/** Mapa linha Excel → foto (primeira imagem na linha). */
export async function extrairFotosXlsx(buffer: Buffer | ArrayBuffer | Uint8Array): Promise<Map<number, FotoPlanilha>> {
  const map = new Map<number, FotoPlanilha>();
  const buf: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(new Uint8Array(buffer));

  try {
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

        const ext = img.extension || "jpeg";
        map.set(linhaExcel, {
          linhaExcel,
          buffer: imgBuffer,
          mime: mimePorExt(ext),
        });
      }
    }
  } catch {
    return map;
  }

  return map;
}

/** Associa fotos às linhas de item (match por linha ou ordem 1:1). */
export function associarFotosLinhas<T extends { linha: number }>(
  linhas: T[],
  fotos: Map<number, FotoPlanilha>,
): (T & { fotoBase64?: string; fotoMime?: string })[] {
  if (linhas.length === 0 || fotos.size === 0) {
    return linhas;
  }

  const rowsImg = [...fotos.keys()].sort((a, b) => a - b);
  const porOrdem =
    rowsImg.length === linhas.length &&
    linhas.every((l, i) => {
      const alvo = rowsImg[i]!;
      return Math.abs(l.linha - alvo) <= 2;
    });

  return linhas.map((lin, idx) => {
    let foto: FotoPlanilha | undefined;

    if (porOrdem) {
      foto = fotos.get(rowsImg[idx]!);
    } else {
      foto =
        fotos.get(lin.linha) ??
        fotos.get(lin.linha - 1) ??
        fotos.get(lin.linha + 1) ??
        fotos.get(lin.linha - 2);
    }

    if (!foto) return lin;
    return {
      ...lin,
      fotoBase64: foto.buffer.toString("base64"),
      fotoMime: foto.mime,
    };
  });
}
