import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FastifyRequest } from "fastify";
import {
  resetFeatureFlagsCacheParaTestes,
  upgradeUploadAtivo,
} from "../src/services/feature-flags.js";

function reqTenant(slug: string, warn = vi.fn()) {
  return {
    auth: { tenantSlug: slug, tenantId: `id-${slug}`, userId: "teste" },
    log: { warn },
  } as unknown as FastifyRequest;
}

describe("feature flag upgradeUpload por tenant", () => {
  const envBackup = { ...process.env };
  let dir: string;
  let arquivo: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cia-features-"));
    arquivo = path.join(dir, "features.json");
    process.env.CIA_FEATURES_PATH = arquivo;
    resetFeatureFlagsCacheParaTestes();
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    resetFeatureFlagsCacheParaTestes();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it.each([
    ["ausente", null],
    ["vazio", ""],
    ["JSON inválido", "{"],
    ["schema inválido", JSON.stringify({ upgradeUpload: "tenant-a" })],
  ])("%s falha fechado e avisa sem spam", async (_nome, conteudo) => {
    if (conteudo != null) await writeFile(arquivo, conteudo);
    const warn = vi.fn();
    const req = reqTenant("tenant-a", warn);
    expect(await upgradeUploadAtivo(req)).toBe(false);
    expect(await upgradeUploadAtivo(req)).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("compara slug exato, sem prefixo ou curinga", async () => {
    await writeFile(arquivo, JSON.stringify({ upgradeUpload: ["tenant-a", "*"] }));
    expect(await upgradeUploadAtivo(reqTenant("tenant-a"))).toBe(true);
    expect(await upgradeUploadAtivo(reqTenant("tenant-a-filial"))).toBe(false);
    expect(await upgradeUploadAtivo(reqTenant("tenant"))).toBe(false);
    expect(await upgradeUploadAtivo(reqTenant("qualquer"))).toBe(false);
  });

  it("recarrega mudança de arquivo sem restart após a janela de 30 segundos", async () => {
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    await writeFile(arquivo, JSON.stringify({ upgradeUpload: [] }));
    const req = reqTenant("tenant-a");
    expect(await upgradeUploadAtivo(req)).toBe(false);

    await writeFile(arquivo, JSON.stringify({ upgradeUpload: ["tenant-a"] }));
    expect(await upgradeUploadAtivo(req)).toBe(false);
    now += 30_001;
    expect(await upgradeUploadAtivo(req)).toBe(true);

    await writeFile(arquivo, JSON.stringify({ upgradeUpload: [] }));
    now += 30_001;
    expect(await upgradeUploadAtivo(req)).toBe(false);
  });
});
