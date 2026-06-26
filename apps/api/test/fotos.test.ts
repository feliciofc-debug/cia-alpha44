import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("fotos — diretório persistente", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
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
});
