import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  hidratar: vi.fn(async <T>(itens: T[]) => itens),
  restaurar: vi.fn(<T>(_entrada: unknown[], saida: T[]) => saida),
  salvar: vi.fn(async (input: unknown) => ({ id: "cot-disabled", input })),
}));

vi.mock("../src/services/foto-ref-boundary.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/foto-ref-boundary.js")>();
  return {
    ...actual,
    hidratarFotosRef: mocks.hidratar,
    restaurarRefsNaResposta: mocks.restaurar,
  };
});

vi.mock("../src/services/cotacoes-persist.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/cotacoes-persist.js")>();
  return {
    ...actual,
    salvarCotacao: mocks.salvar,
  };
});

vi.mock("@cia/db", () => ({
  prisma: {
    tenant: {
      upsert: vi.fn(async ({ where }: { where: { slug: string } }) => ({
        id: `tid-${where.slug}`,
        slug: where.slug,
        nome: where.slug,
      })),
      findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
        if ("logoPath" in select && Object.keys(select).length <= 2) {
          return { logoPath: null, logoMime: null };
        }
        return {
          slug: "default",
          nome: "CIA",
          displayName: null,
          tagline: null,
          logoPath: null,
          brandingAtualizadoEm: null,
        };
      }),
    },
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import { buildServer } from "../src/server.js";
import { resetFeatureFlagsCacheParaTestes } from "../src/services/feature-flags.js";

function itemBase64(fotoBase64: string) {
  return {
    descOriginal: "Mochila escolar",
    descPt: "Mochila escolar",
    descDuimp: "Mochila escolar de poliéster",
    ncm: "42029200",
    ncmCandidatos: [],
    pesoBrutoKg: 2,
    pesoLiqKg: 1.8,
    qtd: 1,
    fobUnitarioUS: 20,
    fobTotalUS: 20,
    aliquotas: { ii: 0.35, ipi: 0.0975, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    fotoBase64,
    fotoMime: "image/png",
  };
}

function cotacao(item: ReturnType<typeof itemBase64>) {
  return {
    cliente: "Tenant sem upgrade",
    benefFiscal: "NENHUM",
    moeda: "USD",
    cambio: 5.2,
    freteTotalUS: 100,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 100,
    antidumpingBRL: 0,
    incoterm: "FOB",
    origem: "CN",
    destino: "SP",
    itens: [item],
    despesas: [],
    outrasDespesasBaseBRL: 0,
    params: {
      markupPct: 0.04,
      pisSaida: 0.0165,
      cofinsSaida: 0.076,
      icmsSaida: 0.18,
      csllSobreMarkup: 0.09,
      irrfAliq: 0.25,
      irrfBaseNotaPct: 0.027,
      ipiTetoAliqMedia: 0.15,
      icmsEntrada: 0,
      aliqFundos: 0,
    },
  };
}

describe("tenant com upgradeUpload desligado", () => {
  const envBackup = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cia-feature-off-"));
    process.env.CIA_FEATURES_PATH = path.join(dir, "inexistente.json");
    process.env.NODE_ENV = "development";
    process.env.CIA_API_KEY = "feature-off-key";
    process.env.CIA_API_TENANT_SLUG = "default";
    process.env.CIA_JWT_SECRET = "test-jwt-secret-minimo-32-chars!!";
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
    process.env.CLASSIFICACAO_NCM_VISION = "off";
    resetFeatureFlagsCacheParaTestes();
    mocks.hidratar.mockClear();
    mocks.restaurar.mockClear();
    mocks.salvar.mockClear();
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    resetFeatureFlagsCacheParaTestes();
    await rm(dir, { recursive: true, force: true });
  });

  it("mantém fronteiras base64 legadas e nunca chama helpers de fotoRef", async () => {
    const pngUmPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4AAAAASUVORK5CYII=",
      "base64",
    );
    const fotoBase64 = pngUmPixel.toString("base64");
    const item = itemBase64(fotoBase64);
    const payloadCotacao = cotacao(item);
    const app = await buildServer();
    const headers = { "x-api-key": "feature-off-key", "content-type": "application/json" };

    const features = await app.inject({ method: "GET", url: "/api/tenant/features", headers });
    expect(features.statusCode).toBe(200);
    expect(features.json()).toEqual({ upgradeUpload: false });

    const fotoRef = await app.inject({
      method: "GET",
      url: "/api/parse/fotos/0123456789abcdef0123456789abcdef",
      headers,
    });
    expect(fotoRef.statusCode).toBe(404);

    const classificar = await app.inject({
      method: "POST",
      url: "/api/classificar",
      headers,
      payload: { linhas: [item] },
    });
    expect(classificar.statusCode).toBe(200);
    expect(classificar.json().itens[0].fotoBase64).toBe(fotoBase64);

    const calcular = await app.inject({
      method: "POST",
      url: "/api/calcular",
      headers,
      payload: payloadCotacao,
    });
    expect(calcular.statusCode).toBe(200);
    expect(calcular.json().itens[0].fotoBase64).toBe(fotoBase64);

    const preview = await app.inject({
      method: "POST",
      url: "/api/cotacoes/preview-pdf?tipo=cliente",
      headers,
      payload: {
        cotacao: payloadCotacao,
        itens: calcular.json().itens,
        resultado: calcular.json().resultado,
      },
    });
    expect(preview.statusCode, preview.body).toBe(200);
    expect(preview.headers["content-type"]).toContain("application/pdf");

    const salvar = await app.inject({
      method: "POST",
      url: "/api/cotacoes",
      headers,
      payload: {
        cotacao: payloadCotacao,
        itens: calcular.json().itens,
        resultado: calcular.json().resultado,
      },
    });
    expect(salvar.statusCode).toBe(200);
    expect(mocks.salvar).toHaveBeenCalledOnce();
    expect(mocks.salvar.mock.calls[0]![0]).toMatchObject({
      itens: [{ fotoBase64, fotoMime: "image/png" }],
    });

    expect(mocks.hidratar).not.toHaveBeenCalled();
    expect(mocks.restaurar).not.toHaveBeenCalled();
    await app.close();
  }, 60_000);
});
