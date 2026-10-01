/** Streaming, fila e proteções do upload grande (somente feature upgradeUpload). */

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Transform, type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  medirUsoParse,
  parseCotaGlobalBytes,
  parseCotaTenantBytes,
  parseUploadsDir,
  parseUploadsTenantDir,
  validarUsoParse,
} from "./parse-storage.js";

const MIB = 1024 * 1024;
const DEFAULT_UPLOAD_MAX_MB = 130;
const DEFAULT_MULTIPART_MARGIN_MB = 10;
const DEFAULT_ZIP_MAX_UNCOMPRESSED_MB = 512;
const DEFAULT_ZIP_MAX_ENTRIES = 10_000;
const DEFAULT_ZIP_MAX_IMAGE_MB = 25;
const DEFAULT_UPLOAD_TMP_TTL_HORAS = 24;
const LIMPEZA_INTERVALO_MS = 60 * 60 * 1000;
const MAX_AGUARDANDO = 2;

function envPositivo(nome: string, fallback: number): number {
  const valor = Number(process.env[nome]);
  return Number.isFinite(valor) && valor > 0 ? valor : fallback;
}

export function uploadGrandeMaxMb(): number {
  return envPositivo("UPLOAD_GRANDE_MAX_MB", DEFAULT_UPLOAD_MAX_MB);
}

export function uploadGrandeMaxBytes(): number {
  return Math.floor(uploadGrandeMaxMb() * MIB);
}

export function uploadGrandeMultipartMarginBytes(): number {
  return Math.floor(envPositivo("UPLOAD_GRANDE_MULTIPART_MARGIN_MB", DEFAULT_MULTIPART_MARGIN_MB) * MIB);
}

export function uploadGrandeRequestMaxBytes(): number {
  return uploadGrandeMaxBytes() + uploadGrandeMultipartMarginBytes();
}

export function mensagemUploadGrandeExcedido(): string {
  return `Arquivo excede ${uploadGrandeMaxMb()}MB — reduza fotos ou compacte a planilha.`;
}

export class UploadGrandeError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 422,
  ) {
    super(message);
    this.name = "UploadGrandeError";
  }
}

type LiberarVaga = () => void;
type Espera = {
  resolve: (liberar: LiberarVaga | null) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

class FilaParseGrande {
  private ativo = false;
  private readonly aguardando: Espera[] = [];

  async adquirir(signal?: AbortSignal): Promise<LiberarVaga | null> {
    if (signal?.aborted) return null;
    if (!this.ativo) {
      this.ativo = true;
      return this.criarLiberacao();
    }
    if (this.aguardando.length >= MAX_AGUARDANDO) return null;

    return new Promise<LiberarVaga | null>((resolve) => {
      const espera: Espera = { resolve, signal };
      if (signal) {
        espera.abort = () => {
          const idx = this.aguardando.indexOf(espera);
          if (idx >= 0) this.aguardando.splice(idx, 1);
          resolve(null);
        };
        signal.addEventListener("abort", espera.abort, { once: true });
      }
      this.aguardando.push(espera);
    });
  }

  private criarLiberacao(): LiberarVaga {
    let liberada = false;
    return () => {
      if (liberada) return;
      liberada = true;
      this.promover();
    };
  }

  private promover(): void {
    while (this.aguardando.length > 0) {
      const proxima = this.aguardando.shift()!;
      if (proxima.abort) proxima.signal?.removeEventListener("abort", proxima.abort);
      if (proxima.signal?.aborted) {
        proxima.resolve(null);
        continue;
      }
      proxima.resolve(this.criarLiberacao());
      return;
    }
    this.ativo = false;
  }

  reset(): void {
    this.ativo = false;
    for (const espera of this.aguardando.splice(0)) {
      if (espera.abort) espera.signal?.removeEventListener("abort", espera.abort);
      espera.resolve(null);
    }
  }
}

const filaParseGrande = new FilaParseGrande();

export function adquirirVagaParseGrande(signal?: AbortSignal): Promise<LiberarVaga | null> {
  return filaParseGrande.adquirir(signal);
}

export function resetFilaParseGrandeParaTestes(): void {
  filaParseGrande.reset();
}

export interface UploadTemporario {
  arquivo: string;
  bytes: number;
}

export async function salvarUploadTemporario(
  tenantId: string,
  origem: Readable,
  signal?: AbortSignal,
): Promise<UploadTemporario> {
  const dir = parseUploadsTenantDir(tenantId);
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const arquivo = path.join(dir, `${randomBytes(16).toString("hex")}.upload`);
  const usoInicial = await medirUsoParse(tenantId);
  validarUsoParse(usoInicial, 0);
  const handle = await fs.open(arquivo, "wx", 0o600);

  let bytes = 0;
  const limitar = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      try {
        if (bytes > uploadGrandeMaxBytes()) {
          throw new UploadGrandeError(mensagemUploadGrandeExcedido());
        }
        if (usoInicial.tenantBytes + bytes > parseCotaTenantBytes()) {
          throw new UploadGrandeError(
            "Espaço temporário deste tenant esgotado. Aguarde a limpeza dos uploads e tente novamente.",
          );
        }
        if (usoInicial.globalBytes + bytes > parseCotaGlobalBytes()) {
          throw new UploadGrandeError("Espaço temporário de uploads esgotado. Tente novamente mais tarde.");
        }
        callback(null, chunk);
      } catch (error) {
        callback(error as Error);
      }
    },
  });

  try {
    await pipeline(origem, limitar, handle.createWriteStream(), { signal });
    return { arquivo, bytes };
  } catch (error) {
    await handle.close().catch(() => {});
    await fs.rm(arquivo, { force: true });
    throw error;
  }
}

export async function lerUploadTemporario(arquivo: string): Promise<Buffer> {
  return fs.readFile(arquivo);
}

export async function removerUploadTemporario(arquivo: string): Promise<void> {
  await fs.rm(arquivo, { force: true });
}

function localizarEocd(buffer: Buffer): number {
  const inicio = Math.max(0, buffer.length - 65_557);
  for (let i = buffer.length - 22; i >= inicio; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

/** Lê só o diretório central; nenhum conteúdo ZIP é descomprimido nesta etapa. */
export function validarZipAntesDoParse(buffer: Buffer): void {
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) return;

  const eocd = localizarEocd(buffer);
  if (eocd < 0) throw new UploadGrandeError("Planilha ZIP inválida ou incompleta.");
  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  const tamanhoCentral = buffer.readUInt32LE(eocd + 12);
  const inicioCentral = buffer.readUInt32LE(eocd + 16);
  if (totalEntradas === 0xffff || tamanhoCentral === 0xffffffff || inicioCentral === 0xffffffff) {
    throw new UploadGrandeError("Planilha ZIP64 não suportada para upload.");
  }

  const maxEntradas = Math.floor(envPositivo("PARSE_ZIP_MAX_ENTRIES", DEFAULT_ZIP_MAX_ENTRIES));
  const maxDescomprimido = envPositivo(
    "PARSE_ZIP_MAX_UNCOMPRESSED_MB",
    DEFAULT_ZIP_MAX_UNCOMPRESSED_MB,
  ) * MIB;
  const maxImagem = envPositivo("PARSE_ZIP_MAX_IMAGE_MB", DEFAULT_ZIP_MAX_IMAGE_MB) * MIB;
  if (totalEntradas > maxEntradas) {
    throw new UploadGrandeError(`Planilha compactada excede o limite de ${maxEntradas} entradas.`);
  }
  if (inicioCentral + tamanhoCentral > buffer.length) {
    throw new UploadGrandeError("Diretório da planilha ZIP está truncado.");
  }

  let offset = inicioCentral;
  let totalDescomprimido = 0;
  for (let i = 0; i < totalEntradas; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new UploadGrandeError("Diretório da planilha ZIP está corrompido.");
    }
    const tamanho = buffer.readUInt32LE(offset + 24);
    const nomeLen = buffer.readUInt16LE(offset + 28);
    const extraLen = buffer.readUInt16LE(offset + 30);
    const comentarioLen = buffer.readUInt16LE(offset + 32);
    if (tamanho === 0xffffffff) {
      throw new UploadGrandeError("Entrada ZIP64 não suportada para upload.");
    }
    const fimNome = offset + 46 + nomeLen;
    if (fimNome > buffer.length) throw new UploadGrandeError("Nome de entrada ZIP truncado.");
    const nome = buffer.subarray(offset + 46, fimNome).toString("utf8").replaceAll("\\", "/");
    totalDescomprimido += tamanho;
    if (totalDescomprimido > maxDescomprimido) {
      throw new UploadGrandeError(
        `Planilha compactada excede ${envPositivo("PARSE_ZIP_MAX_UNCOMPRESSED_MB", DEFAULT_ZIP_MAX_UNCOMPRESSED_MB)}MB descomprimidos.`,
      );
    }
    if (/^xl\/media\//i.test(nome) && tamanho > maxImagem) {
      throw new UploadGrandeError(
        `Imagem da planilha excede ${envPositivo("PARSE_ZIP_MAX_IMAGE_MB", DEFAULT_ZIP_MAX_IMAGE_MB)}MB.`,
      );
    }
    offset = fimNome + extraLen + comentarioLen;
  }
}

export async function limparUploadsTemporarios(now = Date.now()): Promise<void> {
  const root = parseUploadsDir();
  const ttlMs = envPositivo("PARSE_UPLOAD_TMP_TTL_HORAS", DEFAULT_UPLOAD_TMP_TTL_HORAS) * 60 * 60 * 1000;
  const tenants = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const tenant of tenants) {
    if (!tenant.isDirectory() || !/^[a-f0-9]{64}$/.test(tenant.name)) continue;
    const dir = path.join(root, tenant.name);
    const arquivos = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of arquivos) {
      if (!entry.isFile() || !/^[a-f0-9]{32}\.upload$/.test(entry.name)) continue;
      const arquivo = path.join(dir, entry.name);
      const stat = await fs.stat(arquivo).catch(() => null);
      if (stat && stat.mtimeMs < now - ttlMs) await fs.rm(arquivo, { force: true });
    }
    if ((await fs.readdir(dir).catch(() => ["erro"])).length === 0) {
      await fs.rmdir(dir).catch(() => {});
    }
  }
}

export function iniciarLimpezaUploadsTemporarios(): () => void {
  void limparUploadsTemporarios();
  const timer = setInterval(() => void limparUploadsTemporarios(), LIMPEZA_INTERVALO_MS);
  timer.unref();
  return () => clearInterval(timer);
}
