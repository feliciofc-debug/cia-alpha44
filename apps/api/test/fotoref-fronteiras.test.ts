import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("@cia/db", () => ({
  prisma: {
    tenant: {
      upsert: vi.fn(async ({ where }: { where: { slug: string } }) => ({
        id: `tid-${where.slug}`,
        slug: where.slug,
        nome: where.slug,
      })),
      findUnique: vi.fn(async ({ select }: { select: Record<string, boolean> }) => {
        if ("logoPath" in select && Object.keys(select).length <= 2) return { logoPath: null, logoMime: null };
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
import { salvarFotoParse } from "../src/services/parse-fotos.js";

function itemBase(foto: { fotoRef?: string; fotoBase64?: string }) {
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
    fotoMime: "image/png",
    ...foto,
  };
}

function cotacao(item: ReturnType<typeof itemBase>) {
  return {
    cliente: "Teste fotoRef",
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

describe("fotoRef nas fronteiras HTTP", () => {
  const envBackup = { ...process.env };
  let parseDir: string;

  beforeEach(async () => {
    parseDir = await mkdtemp(path.join(os.tmpdir(), "cia-fotoref-http-"));
    process.env.PARSE_FOTOS_DIR = parseDir;
    process.env.CIA_FEATURES_PATH = path.join(parseDir, "features.json");
    await writeFile(process.env.CIA_FEATURES_PATH, JSON.stringify({ upgradeUpload: ["default"] }));
    process.env.NODE_ENV = "development";
    process.env.CIA_API_KEY = "fotoref-test-key";
    process.env.CIA_API_TENANT_SLUG = "default";
    process.env.CIA_JWT_SECRET = "test-jwt-secret-minimo-32-chars!!";
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
    process.env.CLASSIFICACAO_NCM_VISION = "off";
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    await rm(parseDir, { recursive: true, force: true });
  });

  it("classificar e calcular preservam fotoRef sem base64 na resposta", async () => {
    const imagem = Buffer.from("imagem-http");
    const ref = await salvarFotoParse("tid-default", imagem, "image/png");
    const app = await buildServer();
    const headers = { "x-api-key": "fotoref-test-key", "content-type": "application/json" };

    const classificar = await app.inject({
      method: "POST",
      url: "/api/classificar",
      headers,
      payload: {
        linhas: [{
          descOriginal: "Mochila escolar",
          ncm: "42029200",
          qtd: 1,
          pesoBrutoKg: 2,
          pesoLiqKg: 1.8,
          fobUnitarioUS: 20,
          fobTotalUS: 20,
          fotoRef: ref,
          fotoMime: "image/png",
        }],
      },
    });
    expect(classificar.statusCode).toBe(200);
    expect(classificar.json().itens[0].fotoRef).toBe(ref);
    expect(classificar.body).not.toContain("fotoBase64");
    const classificarLegado = await app.inject({
      method: "POST",
      url: "/api/classificar",
      headers,
      payload: {
        linhas: [{
          descOriginal: "Mochila escolar",
          ncm: "42029200",
          qtd: 1,
          pesoBrutoKg: 2,
          pesoLiqKg: 1.8,
          fobUnitarioUS: 20,
          fobTotalUS: 20,
          fotoBase64: imagem.toString("base64"),
          fotoMime: "image/png",
        }],
      },
    });
    expect(classificarLegado.statusCode).toBe(200);
    const semFoto = (item: Record<string, unknown>) => {
      const { fotoBase64: _base64, fotoRef: _ref, ...rest } = item;
      return rest;
    };
    expect(semFoto(classificar.json().itens[0])).toEqual(semFoto(classificarLegado.json().itens[0]));

    const calcular = await app.inject({
      method: "POST",
      url: "/api/calcular",
      headers,
      payload: cotacao(itemBase({ fotoRef: ref })),
    });
    expect(calcular.statusCode).toBe(200);
    expect(calcular.json().itens[0].fotoRef).toBe(ref);
    expect(calcular.body).not.toContain("fotoBase64");
    const calcularLegado = await app.inject({
      method: "POST",
      url: "/api/calcular",
      headers,
      payload: cotacao(itemBase({ fotoBase64: imagem.toString("base64") })),
    });
    expect(calcularLegado.statusCode).toBe(200);
    expect(semFoto(calcular.json().itens[0])).toEqual(semFoto(calcularLegado.json().itens[0]));
    await app.close();
  }, 60_000);

  it("preview-pdf aceita fotoRef e gera PDF cliente", async () => {
    const pngUmPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4AAAAASUVORK5CYII=",
      "base64",
    );
    const ref = await salvarFotoParse("tid-default", pngUmPixel, "image/png");
    const app = await buildServer();
    const headers = { "x-api-key": "fotoref-test-key", "content-type": "application/json" };
    const calc = await app.inject({
      method: "POST",
      url: "/api/calcular",
      headers,
      payload: cotacao(itemBase({ fotoRef: ref })),
    });
    expect(calc.statusCode).toBe(200);

    const preview = await app.inject({
      method: "POST",
      url: "/api/cotacoes/preview-pdf?tipo=cliente",
      headers,
      payload: {
        cotacao: cotacao(itemBase({ fotoRef: ref })),
        itens: calc.json().itens,
        resultado: calc.json().resultado,
      },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.headers["content-type"]).toContain("application/pdf");
    expect(preview.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
    await app.close();
  }, 60_000);
});
