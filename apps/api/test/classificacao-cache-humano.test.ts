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
  cacheClassificacaoToxico,
  deveIgnorarCacheSemNcmReal,
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

describe("cacheClassificacaoToxico", () => {
  it("pula lookup de cache quando o fluxo exige miss para linha sem coluna NCM real", () => {
    expect(
      deveIgnorarCacheSemNcmReal({
        ignorarCacheQuandoSemNcmReal: true,
        temColunaNcmReal: false,
      }),
    ).toBe(true);
    expect(
      deveIgnorarCacheSemNcmReal({
        ignorarCacheQuandoSemNcmReal: true,
        temColunaNcmReal: true,
      }),
    ).toBe(false);
    expect(
      deveIgnorarCacheSemNcmReal({
        ignorarCacheQuandoSemNcmReal: false,
        temColunaNcmReal: false,
      }),
    ).toBe(false);
  });

  it("ignora cache planilha-cliente quando a linha atual nao tem coluna NCM real", () => {
    const output = {
      descPt: "Maquina de pipoca",
      descDuimp: "Maquina de pipoca — NCM declarado na planilha do cliente.",
      ncmCandidatos: [{ ncm: "85361000", confianca: 0.95 }],
      classificacaoProvedor: "planilha-cliente" as const,
    };

    expect(cacheClassificacaoToxico(output, { temColunaNcmReal: false })).toBe(true);
    expect(cacheClassificacaoToxico(output, { temColunaNcmReal: true })).toBe(false);
  });

  it("continua bloqueando cache planilha-china legado", () => {
    const output = {
      descPt: "Produto",
      descDuimp: "Produto",
      ncmCandidatos: [{ ncm: "84238900", confianca: 0.8 }],
      classificacaoProvedor: "planilha-china" as never,
    };

    expect(cacheClassificacaoToxico(output)).toBe(true);
  });
});
