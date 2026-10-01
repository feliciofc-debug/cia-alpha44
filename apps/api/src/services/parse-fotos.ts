/** Fotos temporárias do parse, isoladas por tenant e referenciadas por ID opaco. */

import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { FotoSink } from "@cia/pipeline";
import { FOTOS_DIR } from "./fotos.js";

const FOTO_REF_RE = /^[a-f0-9]{32}$/;
const DEFAULT_TTL_HORAS = 168;
const LIMPEZA_INTERVALO_MS = 60 * 60 * 1000;
const MIME_PERMITIDOS = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

interface FotoMeta {
  mime: string;
  criadaEm: string;
}

export interface FotoParse {
  buffer: Buffer;
  mime: string;
}

export function parseFotosDir(): string {
  const configured = process.env.PARSE_FOTOS_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(path.dirname(FOTOS_DIR), "parse-fotos");
}

export function parseFotosTtlHoras(): number {
  const raw = Number(process.env.PARSE_FOTOS_TTL_HORAS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_HORAS;
}

function tenantDir(tenantId: string): string {
  const tenantKey = createHash("sha256").update(tenantId).digest("hex");
  return path.join(parseFotosDir(), tenantKey);
}

function caminhosFoto(tenantId: string, ref: string) {
  const dir = tenantDir(tenantId);
  return {
    dir,
    foto: path.join(dir, `${ref}.bin`),
    meta: path.join(dir, `${ref}.json`),
  };
}

function mimeSeguro(mime: string): string {
  return MIME_PERMITIDOS.has(mime) ? mime : "image/jpeg";
}

function expirada(meta: FotoMeta, now = Date.now()): boolean {
  const criada = Date.parse(meta.criadaEm);
  return !Number.isFinite(criada) || now - criada > parseFotosTtlHoras() * 60 * 60 * 1000;
}

async function removerPar(tenantId: string, ref: string): Promise<void> {
  if (!FOTO_REF_RE.test(ref)) return;
  const paths = caminhosFoto(tenantId, ref);
  await Promise.all([
    fs.rm(paths.foto, { force: true }),
    fs.rm(paths.meta, { force: true }),
  ]);
}

export async function salvarFotoParse(
  tenantId: string,
  buffer: Buffer,
  mime: string,
): Promise<string> {
  const ref = randomBytes(16).toString("hex");
  const paths = caminhosFoto(tenantId, ref);
  await fs.mkdir(paths.dir, { recursive: true, mode: 0o700 });

  const nonce = randomBytes(8).toString("hex");
  const fotoTmp = `${paths.foto}.${nonce}.tmp`;
  const metaTmp = `${paths.meta}.${nonce}.tmp`;
  const meta: FotoMeta = { mime: mimeSeguro(mime), criadaEm: new Date().toISOString() };

  try {
    await fs.writeFile(fotoTmp, buffer, { flag: "wx", mode: 0o600 });
    await fs.writeFile(metaTmp, JSON.stringify(meta), { flag: "wx", mode: 0o600 });
    await fs.rename(fotoTmp, paths.foto);
    await fs.rename(metaTmp, paths.meta);
    return ref;
  } catch (error) {
    await Promise.all([
      fs.rm(fotoTmp, { force: true }),
      fs.rm(metaTmp, { force: true }),
      fs.rm(paths.foto, { force: true }),
      fs.rm(paths.meta, { force: true }),
    ]);
    throw error;
  }
}

export function criarFotoSinkParse(tenantId: string): FotoSink {
  return ({ buffer, mime }) => salvarFotoParse(tenantId, buffer, mime);
}

export async function lerFotoParse(tenantId: string, ref: string): Promise<FotoParse | null> {
  if (!FOTO_REF_RE.test(ref)) return null;
  const paths = caminhosFoto(tenantId, ref);
  try {
    const rawMeta = await fs.readFile(paths.meta, "utf8");
    const meta = JSON.parse(rawMeta) as FotoMeta;
    if (expirada(meta)) {
      await removerPar(tenantId, ref);
      return null;
    }
    return { buffer: await fs.readFile(paths.foto), mime: mimeSeguro(meta.mime) };
  } catch {
    return null;
  }
}

export async function validarFotoParse(tenantId: string, ref: string): Promise<boolean> {
  if (!FOTO_REF_RE.test(ref)) return false;
  const paths = caminhosFoto(tenantId, ref);
  try {
    const meta = JSON.parse(await fs.readFile(paths.meta, "utf8")) as FotoMeta;
    if (expirada(meta)) {
      await removerPar(tenantId, ref);
      return false;
    }
    const stat = await fs.stat(paths.foto);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function limparFotosParseExpiradas(now = Date.now()): Promise<void> {
  const root = parseFotosDir();
  let tenants: Array<import("node:fs").Dirent>;
  try {
    tenants = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const tenant of tenants) {
    if (!tenant.isDirectory() || !/^[a-f0-9]{64}$/.test(tenant.name)) continue;
    const dir = path.join(root, tenant.name);
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const match = /^([a-f0-9]{32})\.json$/.exec(entry.name);
      if (!entry.isFile() || !match) continue;
      const ref = match[1]!;
      try {
        const meta = JSON.parse(await fs.readFile(path.join(dir, entry.name), "utf8")) as FotoMeta;
        if (!expirada(meta, now)) continue;
      } catch {
        // Metadado inválido é tratado como expirado.
      }
      await Promise.all([
        fs.rm(path.join(dir, `${ref}.bin`), { force: true }),
        fs.rm(path.join(dir, `${ref}.json`), { force: true }),
      ]);
    }
    const cutoff = now - parseFotosTtlHoras() * 60 * 60 * 1000;
    const sobras = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of sobras) {
      if (!entry.isFile() || !(/^[a-f0-9]{32}\.bin$/.test(entry.name) || /\.tmp$/.test(entry.name))) continue;
      const arquivo = path.join(dir, entry.name);
      const stat = await fs.stat(arquivo).catch(() => null);
      if (stat && stat.mtimeMs < cutoff) await fs.rm(arquivo, { force: true });
    }
    const restantes = await fs.readdir(dir).catch(() => ["erro"]);
    if (restantes.length === 0) await fs.rmdir(dir).catch(() => {});
  }
}

export function iniciarLimpezaFotosParse(): () => void {
  void limparFotosParseExpiradas();
  const timer = setInterval(() => void limparFotosParseExpiradas(), LIMPEZA_INTERVALO_MS);
  timer.unref();
  return () => clearInterval(timer);
}
