import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";

const { findUnique, update } = vi.hoisted(() => ({ findUnique: vi.fn(), update: vi.fn() }));

vi.mock("@cia/db", () => ({
  prisma: {
    tenant: {
      findUnique,
      update,
    },
  },
}));

import { lerTenantLogo, obterTenantBranding, salvarTenantLogo, TenantLogoInvalidaError } from "../src/services/tenant-branding.js";

describe("tenant branding", () => {
  beforeEach(async () => {
    findUnique.mockReset();
    update.mockReset();
    if (process.env.CIA_BRANDING_DIR) {
      await rm(process.env.CIA_BRANDING_DIR, { recursive: true, force: true });
    }
    process.env.CIA_BRANDING_DIR = await mkdtemp(path.join(os.tmpdir(), "cia-branding-"));
  });

  it("retorna branding com logoUrl quando o tenant tem logo configurada", async () => {
    findUnique.mockResolvedValueOnce({
      slug: "user_paulo.mesquita@innove888.com.br",
      nome: "user_paulo.mesquita@innove888.com.br",
      displayName: "INNOVE 888",
      tagline: "Gestão de trade",
      logoPath: "builtin:logo-innove888.jpeg",
      brandingAtualizadoEm: new Date("2026-07-30T00:00:00.000Z"),
    });

    await expect(obterTenantBranding("tenant-innove")).resolves.toMatchObject({
      displayName: "INNOVE 888",
      tagline: "Gestão de trade",
      logoUrl: "/api/tenant/branding/logo",
      hasTenantBranding: true,
    });
  });

  it("usa fallback textual e logoUrl null quando o tenant não tem logo", async () => {
    findUnique.mockResolvedValueOnce({
      slug: "user_cliente@example.com",
      nome: "Cliente Example",
      displayName: null,
      tagline: null,
      logoPath: null,
      brandingAtualizadoEm: null,
    });

    await expect(obterTenantBranding("tenant-sem-logo")).resolves.toEqual({
      displayName: "Cliente Example",
      tagline: null,
      logoUrl: null,
      hasTenantBranding: false,
      brandingAtualizadoEm: null,
    });
  });

  it("não carrega logos builtin fora da allowlist", async () => {
    findUnique.mockResolvedValueOnce({
      logoPath: "builtin:logo-de-outro-cliente.jpeg",
      logoMime: "image/jpeg",
    });

    await expect(lerTenantLogo("tenant-invalido")).resolves.toBeNull();
  });

  it("não carrega caminhos absolutos como logo de tenant", async () => {
    findUnique.mockResolvedValueOnce({
      logoPath: "/etc/passwd",
      logoMime: "text/plain",
    });

    await expect(lerTenantLogo("tenant-path-absoluto")).resolves.toBeNull();
  });

  it("salva logo PNG válida no diretório seguro do tenant", async () => {
    const png = await sharp({
      create: {
        width: 1,
        height: 1,
        channels: 4,
        background: "#1FA67A",
      },
    })
      .png()
      .toBuffer();
    update.mockResolvedValueOnce({});
    findUnique.mockResolvedValueOnce({
      slug: "user_cliente@example.com",
      nome: "Cliente Example",
      displayName: "Cliente Example",
      tagline: null,
      logoPath: "tenant_logo/logo.png",
      brandingAtualizadoEm: new Date("2026-07-30T00:00:00.000Z"),
    });

    await expect(salvarTenantLogo({ tenantId: "tenant_logo", buffer: png })).resolves.toMatchObject({
      logoUrl: "/api/tenant/branding/logo",
      hasTenantBranding: true,
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "tenant_logo" },
      data: expect.objectContaining({
        logoPath: "tenant_logo/logo.png",
        logoMime: "image/png",
      }),
    });
  });

  it("rejeita arquivo que não é imagem real", async () => {
    await expect(salvarTenantLogo({ tenantId: "tenant_logo", buffer: Buffer.from("not an image") })).rejects.toBeInstanceOf(
      TenantLogoInvalidaError,
    );
    expect(update).not.toHaveBeenCalled();
  });
});
