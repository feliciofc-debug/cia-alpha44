import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@cia/db", () => ({
  prisma: {
    tenant: {
      findUnique,
    },
  },
}));

import { lerTenantLogo, obterTenantBranding } from "../src/services/tenant-branding.js";

describe("tenant branding", () => {
  beforeEach(() => {
    findUnique.mockReset();
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
});
