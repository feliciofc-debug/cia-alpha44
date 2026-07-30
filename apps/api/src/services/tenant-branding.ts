import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@cia/db";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = path.join(__dirname, "..", "assets");
const BUILTIN_LOGOS = new Set(["logo-innove888.jpeg"]);

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

function displayNameSeguro(tenant: { displayName: string | null; nome: string; slug: string }): string {
  return tenant.displayName?.trim() || tenant.nome.trim() || tenant.slug;
}

function brandingStorageDir(): string {
  return process.env.CIA_BRANDING_DIR?.trim() || path.join(process.cwd(), "data", "branding");
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
