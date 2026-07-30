import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { prisma } from "@cia/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const BUILTIN_LOGOS = new Set(["logo-innove888.jpeg"]);
export const TENANT_LOGO_MAX_BYTES = 2 * 1024 * 1024;
const LOGO_FORMATOS = new Set(["jpeg", "png", "webp"]);
const LOGO_MIME: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type TenantBranding = {
  displayName: string;
  tagline: string | null;
  logoUrl: string | null;
  hasTenantBranding: boolean;
  brandingAtualizadoEm: Date | null;
};

export type TenantLogo = {
  buffer: Buffer;
  mime: string;
};

export class TenantBrandingNotFoundError extends Error {
  constructor() {
    super("Tenant não encontrado.");
    this.name = "TenantBrandingNotFoundError";
  }
}

export class TenantLogoInvalidaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TenantLogoInvalidaError";
  }
}

function displayNameSeguro(tenant: { displayName: string | null; nome: string; slug: string }): string {
  return tenant.displayName?.trim() || tenant.nome.trim() || tenant.slug;
}

function brandingStorageDir(): string {
  return process.env.CIA_BRANDING_DIR?.trim() || path.join(process.cwd(), "data", "branding");
}

function tenantLogoDir(tenantId: string): string {
  return path.join(brandingStorageDir(), tenantId.replace(/[^a-zA-Z0-9_-]/g, "_"));
}

function resolverLogoPath(logoPath: string): string | null {
  if (logoPath.startsWith("builtin:")) {
    const nome = logoPath.slice("builtin:".length);
    if (!BUILTIN_LOGOS.has(nome)) return null;
    return path.join(ASSETS_DIR, nome);
  }

  if (path.isAbsolute(logoPath)) return null;

  const root = path.resolve(brandingStorageDir());
  const alvo = path.resolve(root, logoPath);
  const relativo = path.relative(root, alvo);
  if (relativo.startsWith("..") || path.isAbsolute(relativo)) return null;
  return alvo;
}

export async function obterTenantBranding(tenantId: string): Promise<TenantBranding> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      slug: true,
      nome: true,
      displayName: true,
      tagline: true,
      logoPath: true,
      brandingAtualizadoEm: true,
    },
  });

  if (!tenant) throw new TenantBrandingNotFoundError();

  return {
    displayName: displayNameSeguro(tenant),
    tagline: tenant.tagline?.trim() || null,
    logoUrl: tenant.logoPath?.trim() ? "/api/tenant/branding/logo" : null,
    hasTenantBranding: Boolean(tenant.displayName?.trim() || tenant.tagline?.trim() || tenant.logoPath?.trim()),
    brandingAtualizadoEm: tenant.brandingAtualizadoEm ?? null,
  };
}

export async function lerTenantLogo(tenantId: string): Promise<TenantLogo | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { logoPath: true, logoMime: true },
  });
  if (!tenant) return null;
  const logoPath = tenant.logoPath?.trim();
  if (!logoPath) return null;

  const caminho = resolverLogoPath(logoPath);
  if (!caminho) return null;

  try {
    return {
      buffer: await readFile(caminho),
      mime: tenant.logoMime?.trim() || "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function atualizarTenantBranding(input: {
  tenantId: string;
  displayName?: string | null;
  tagline?: string | null;
}): Promise<TenantBranding> {
  await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      displayName: input.displayName?.trim() || null,
      tagline: input.tagline?.trim() || null,
      brandingAtualizadoEm: new Date(),
    },
  });
  return obterTenantBranding(input.tenantId);
}

async function detectarFormatoLogo(buffer: Buffer): Promise<{ ext: string; mime: string }> {
  let meta: sharp.Metadata;
  try {
    meta = await sharp(buffer, { failOn: "error" }).metadata();
  } catch {
    throw new TenantLogoInvalidaError("Logo inválida. Envie PNG, JPEG ou WebP.");
  }
  const formato = meta.format;
  if (!formato || !LOGO_FORMATOS.has(formato)) {
    throw new TenantLogoInvalidaError("Formato inválido. Envie PNG, JPEG ou WebP.");
  }
  return { ext: formato === "jpeg" ? "jpg" : formato, mime: LOGO_MIME[formato] ?? "application/octet-stream" };
}

export async function salvarTenantLogo(input: {
  tenantId: string;
  buffer: Buffer;
}): Promise<TenantBranding> {
  if (input.buffer.byteLength > TENANT_LOGO_MAX_BYTES) {
    throw new TenantLogoInvalidaError("Logo excede 2 MB.");
  }

  const { ext, mime } = await detectarFormatoLogo(input.buffer);
  const dir = tenantLogoDir(input.tenantId);
  await mkdir(dir, { recursive: true });
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const file = `logo.${ext}`;
  await writeFile(path.join(dir, file), input.buffer, { mode: 0o644 });
  const logoPath = `${path.basename(dir)}/${file}`;

  await prisma.tenant.update({
    where: { id: input.tenantId },
    data: {
      logoPath,
      logoMime: mime,
      brandingAtualizadoEm: new Date(),
    },
  });

  return obterTenantBranding(input.tenantId);
}

export async function removerTenantLogo(tenantId: string): Promise<TenantBranding> {
  await rm(tenantLogoDir(tenantId), { recursive: true, force: true });
  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      logoPath: null,
      logoMime: null,
      brandingAtualizadoEm: new Date(),
    },
  });
  return obterTenantBranding(tenantId);
}
