/** Persistência de fotos de produto (compliance) — filesystem local. */

import fs from "node:fs/promises";
import path from "node:path";

const FOTOS_DIR = process.env.FOTOS_DIR || path.join(process.cwd(), "data", "fotos");

function extPorMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

export async function salvarFotoItem(
  cotacaoId: string,
  ordem: number,
  base64: string,
  mime: string,
): Promise<string> {
  const ext = extPorMime(mime);
  const rel = `${cotacaoId}/${ordem}.${ext}`;
  const full = path.join(FOTOS_DIR, rel);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, Buffer.from(base64, "base64"));
  return rel;
}

export async function lerFotoItem(relPath: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const full = path.join(FOTOS_DIR, relPath);
    const buffer = await fs.readFile(full);
    const ext = path.extname(relPath).toLowerCase();
    const mime =
      ext === ".png"
        ? "image/png"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".webp"
            ? "image/webp"
            : "image/jpeg";
    return { buffer, mime };
  } catch {
    return null;
  }
}

export async function excluirFotosCotacao(cotacaoId: string): Promise<void> {
  const dir = path.join(FOTOS_DIR, cotacaoId);
  await fs.rm(dir, { recursive: true, force: true });
}

/** Carrega foto do disco para gerar PDF de cotação salva. */
export async function itensComFotosCarregadas(itens: import("@cia/shared").Item[]): Promise<import("@cia/shared").Item[]> {
  return Promise.all(
    itens.map(async (it) => {
      if (it.fotoBase64 || !it.fotoPath) return it;
      const f = await lerFotoItem(it.fotoPath);
      if (!f) return it;
      return {
        ...it,
        fotoBase64: f.buffer.toString("base64"),
        fotoMime: f.mime,
      };
    }),
  );
}

export function fotoUrlApi(cotacaoId: string, ordem: number): string {
  return `/api/cotacoes/${cotacaoId}/foto/${ordem}`;
}
