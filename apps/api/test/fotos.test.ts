import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

describe("fotos — diretório persistente", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.resetModules();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("usa apps/api/data/fotos como default, independente do cwd", async () => {
    vi.stubEnv("FOTOS_DIR", "");
    vi.resetModules();

    const fotos = await import("../src/services/fotos.js");
    const esperado = fileURLToPath(new URL("../data/fotos", import.meta.url));

    expect(path.normalize(fotos.FOTOS_DIR)).toBe(path.normalize(esperado));
    expect(fotos.caminhoFotoItem("cotacao/0.png")).toBe(path.join(fotos.FOTOS_DIR, "cotacao/0.png"));
  });

  it("respeita FOTOS_DIR explícito", async () => {
    vi.stubEnv("FOTOS_DIR", "/var/lib/cia-alpha44/fotos");
    vi.resetModules();

    const fotos = await import("../src/services/fotos.js");

    expect(fotos.FOTOS_DIR).toBe("/var/lib/cia-alpha44/fotos");
    expect(fotos.caminhoFotoItem("cotacao/9.jpg")).toBe("/var/lib/cia-alpha44/fotos/cotacao/9.jpg");
  });

  it("normaliza PNG transparente para JPEG com fundo branco ao salvar", async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cia-fotos-"));
    vi.stubEnv("FOTOS_DIR", tempDir);
    vi.resetModules();

    const fotos = await import("../src/services/fotos.js");
    const pngTransparente = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer();

    const rel = await fotos.salvarFotoItem("cot-wps", 0, pngTransparente.toString("base64"), "image/png");
    const salva = await fotos.lerFotoItem(rel);
    expect(rel).toBe("cot-wps/0.jpg");
    expect(salva?.mime).toBe("image/jpeg");

    const pixel = await sharp(salva!.buffer).raw().toBuffer();
    expect(pixel[0]).toBeGreaterThanOrEqual(245);
    expect(pixel[1]).toBeGreaterThanOrEqual(245);
    expect(pixel[2]).toBeGreaterThanOrEqual(245);
  });
});
