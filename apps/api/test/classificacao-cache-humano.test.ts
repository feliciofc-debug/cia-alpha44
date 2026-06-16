import { describe, it, expect, vi, beforeEach } from "vitest";
import { criarNcmCatalog, loadNcmVigenteCache } from "@cia/pipeline";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "@cia/db";
import {
  outputConfirmacaoHumana,
  salvarClassificacaoCacheHumano,
  versoesClassificacaoCache,
  CacheHumanoIncoerenteError,
} from "../src/services/classificacao-cache.js";

const catalog = criarNcmCatalog(loadNcmVigenteCache());
const versoes = versoesClassificacaoCache(catalog);

describe("salvarClassificacaoCacheHumano — coerência P1.1", () => {
  beforeEach(() => {
    vi.mocked(prisma.classificacaoCache.upsert).mockClear();
    process.env.DATABASE_URL = "postgresql://test";
  });

  it("não grava moto confirmada com NCM 9617 (best-effort)", async () => {
    const input = {
      descOriginal: "1-20 — MOT-EL-3000 — 电动摩托车 3000W 锂电池",
      material: "钢/铝合金",
      uso: "骑行",
    };
    await salvarClassificacaoCacheHumano(
      input,
      versoes,
      outputConfirmacaoHumana({ ...input, ncmConfirmado: "96170010" }),
    );
    expect(prisma.classificacaoCache.upsert).not.toHaveBeenCalled();
  });

  it("grava moto confirmada com NCM 87116000", async () => {
    const input = {
      descOriginal: "1-20 — MOT-EL-3000 — 电动摩托车 3000W 锂电池",
      material: "钢/铝合金",
      uso: "骑行",
    };
    await salvarClassificacaoCacheHumano(
      input,
      versoes,
      outputConfirmacaoHumana({ ...input, ncmConfirmado: "87116000" }),
    );
    expect(prisma.classificacaoCache.upsert).toHaveBeenCalledOnce();
  });

  it("strict lança CacheHumanoIncoerenteError", async () => {
    const input = {
      descOriginal: "1-20 — MOT-EL-3000 — 电动摩托车 3000W 锂电池",
      uso: "骑行",
    };
    await expect(
      salvarClassificacaoCacheHumano(
        input,
        versoes,
        outputConfirmacaoHumana({ ...input, ncmConfirmado: "96170010" }),
        { strict: true },
      ),
    ).rejects.toBeInstanceOf(CacheHumanoIncoerenteError);
  });
});
