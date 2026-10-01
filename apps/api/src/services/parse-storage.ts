/** Diretórios e cotas compartilhados por uploads e fotos temporárias do parse. */

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { FOTOS_DIR } from "./fotos.js";

const MIB = 1024 * 1024;
const DEFAULT_COTA_TENANT_MB = 1024;
const DEFAULT_COTA_GLOBAL_MB = 8192;

function envMb(nome: string, fallback: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : fallback;
}

export function parseFotosDir(): string {
  const configured = process.env.PARSE_FOTOS_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(path.dirname(FOTOS_DIR), "parse-fotos");
}

export function parseUploadsDir(): string {
  const configured = process.env.PARSE_UPLOAD_TMP_DIR?.trim();
  return configured ? path.resolve(configured) : path.join(path.dirname(parseFotosDir()), "parse-uploads");
}

export function tenantParseKey(tenantId: string): string {
  return createHash("sha256").update(tenantId).digest("hex");
}

export function parseFotosTenantDir(tenantId: string): string {
  return path.join(parseFotosDir(), tenantParseKey(tenantId));
}

export function parseUploadsTenantDir(tenantId: string): string {
  return path.join(parseUploadsDir(), tenantParseKey(tenantId));
}

export function parseCotaTenantBytes(): number {
  return Math.floor(envMb("PARSE_COTA_TENANT_MB", DEFAULT_COTA_TENANT_MB) * MIB);
}

export function parseCotaGlobalBytes(): number {
  return Math.floor(envMb("PARSE_COTA_GLOBAL_MB", DEFAULT_COTA_GLOBAL_MB) * MIB);
}

async function tamanhoArquivos(root: string): Promise<number> {
  let total = 0;
  const pendentes = [root];
  while (pendentes.length > 0) {
    const dir = pendentes.pop()!;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const arquivo = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        pendentes.push(arquivo);
      } else if (entry.isFile()) {
        total += (await fs.stat(arquivo).catch(() => null))?.size ?? 0;
      }
    }
  }
  return total;
}

export interface UsoParse {
  tenantBytes: number;
  globalBytes: number;
}

export async function medirUsoParse(tenantId: string): Promise<UsoParse> {
  const tenantKey = tenantParseKey(tenantId);
  const [fotosTenant, uploadsTenant, fotosGlobal, uploadsGlobal] = await Promise.all([
    tamanhoArquivos(path.join(parseFotosDir(), tenantKey)),
    tamanhoArquivos(path.join(parseUploadsDir(), tenantKey)),
    tamanhoArquivos(parseFotosDir()),
    tamanhoArquivos(parseUploadsDir()),
  ]);
  return {
    tenantBytes: fotosTenant + uploadsTenant,
    globalBytes: fotosGlobal + uploadsGlobal,
  };
}

export class CotaParseExcedidaError extends Error {
  constructor(public readonly escopo: "tenant" | "global") {
    super(
      escopo === "tenant"
        ? "Espaço temporário deste tenant esgotado. Aguarde a limpeza dos uploads e tente novamente."
        : "Espaço temporário de uploads esgotado. Tente novamente mais tarde.",
    );
    this.name = "CotaParseExcedidaError";
  }
}

export function validarUsoParse(uso: UsoParse, bytesAdicionais: number): void {
  if (uso.tenantBytes + bytesAdicionais > parseCotaTenantBytes()) {
    throw new CotaParseExcedidaError("tenant");
  }
  if (uso.globalBytes + bytesAdicionais > parseCotaGlobalBytes()) {
    throw new CotaParseExcedidaError("global");
  }
}

export async function verificarCotaParse(tenantId: string, bytesAdicionais: number): Promise<void> {
  validarUsoParse(await medirUsoParse(tenantId), bytesAdicionais);
}
