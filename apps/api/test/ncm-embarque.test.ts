import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildBenchmarkIndex,
  defaultBenchmarkPlanilhaPath,
  historicoFromPlanilhaSeed,
  loadComexSeed,
  loadBenchmarkPlanilha,
  criarNcmCatalog,
  loadNcmVigenteCache,
  substituirHistoricoBenchmark,
  type LinhaCrua,
} from "@cia/pipeline";
import { montarItens } from "../src/services/cotacao.js";
import { limparCacheNcmHelper } from "../src/services/ncm-helper.js";
import type { AppState } from "../src/state.js";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

function buildState(): AppState {
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    tecSource: { buscar: () => null, buscarAsync: async () => null },
    siscomex: { lookup: () => null },
    ocr: null,
    provider: { nome: "mock", disponivel: false, classify: async () => [] },
  } as unknown as AppState;
}

function buildStateComPlanilhaChina(): AppState {
  const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
  if (!seed) throw new Error("Seed da planilha China não encontrado");
  substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto, {
      planilhaPeriodo: seed.periodoReferencia ?? null,
      comexstatPeriodo: comex.periodoReferencia ?? null,
    }),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    tecSource: { buscar: () => null, buscarAsync: async () => null },
    siscomex: { lookup: () => null },
    ocr: null,
    provider: { nome: "mock", disponivel: false, classify: async () => [] },
  } as unknown as AppState;
}

describe("ncmEmbarque — upload classificar", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
    delete process.env.CLASSIFICACAO_NCM_VISION;
    limparCacheNcmHelper();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste ncmEmbarque da coluna embarque quando informado", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-97;挂钩秤;Balança de gancho portátil",
        ncm: "84238900",
        qtd: 100,
        pesoBrutoKg: 10,
        pesoLiqKg: 9,
        fobTotalUS: 50,
        fobUnitarioUS: null,
      },
    ];
    const { itens } = await montarItens(linhas, buildState());
    expect(itens[0]!.ncmEmbarque).toBe("84238900");
    expect(itens[0]!.ncmEmbarqueStatus).toBe("coluna");
  });

  it("persiste ncmEmbarque na herança planilha-cliente-familia (linha sem coluna NCM)", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W",
        ncm: "87116000",
        uso: "骑行",
        qtd: 500,
        pesoBrutoKg: 100,
        pesoLiqKg: 90,
        fobTotalUS: 1000,
        fobUnitarioUS: null,
      },
      {
        descOriginal: "ES-T19A-10WHI — 滑板车T1 MAX 10寸500W 白色",
        ncm: null,
        uso: "骑行",
        qtd: 210,
        pesoBrutoKg: 50,
        pesoLiqKg: 45,
        fobTotalUS: 500,
        fobUnitarioUS: null,
      },
    ];
    const { itens } = await montarItens(linhas, buildState());
    expect(itens[0]!.ncmEmbarque).toBe("87116000");
    expect(itens[0]!.ncmEmbarqueStatus).toBe("coluna");
    expect(itens[1]!.ncmFonte).toBe("planilha-cliente-familia");
    expect(itens[1]!.ncmEmbarque).toBe("87116000");
    expect(itens[1]!.ncmEmbarqueStatus).toBe("heranca-familia");
  });

  it("gemini sem coluna NCM — ncmEmbarque null explícito + sem-ncm-coluna", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-5123;烘干机;Secadora portátil",
        ncm: null,
        qtd: 100,
        pesoBrutoKg: 10,
        pesoLiqKg: 9,
        fobTotalUS: 50,
        fobUnitarioUS: null,
      },
    ];
    const { itens } = await montarItens(linhas, buildState());
    expect(itens[0]!.ncmEmbarque).toBeNull();
    expect(itens[0]!.ncmEmbarqueStatus).toBe("sem-ncm-coluna");
  });

  it("linha com ncm null (meta injetado ignorado) — não classifica planilha-cliente", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-97;挂钩秤;Balança de gancho portátil (dinamômetro de pesagem)",
        ncm: null,
        qtd: 100,
        pesoBrutoKg: 10,
        pesoLiqKg: 9,
        fobTotalUS: 50,
        fobUnitarioUS: null,
      },
    ];
    const { itens } = await montarItens(linhas, buildState());
    expect(itens[0]!.ncmFonte).not.toBe("planilha-cliente");
    expect(itens[0]!.ncmAvisos?.some((a) => /declarado na planilha do cliente/i.test(a))).toBeFalsy();
  });

  it("sem coluna NCM: hit coerente da planilha China vence antes do Gemini", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-5110 — Pipoqueira Preta 220V Plug Redondo",
        ncm: null,
        qtd: 100,
        pesoBrutoKg: 10,
        pesoLiqKg: 9,
        fobTotalUS: 50,
        fobUnitarioUS: null,
      },
    ];

    const { itens } = await montarItens(linhas, buildStateComPlanilhaChina());

    expect(itens[0]!.ncmFonte).toBe("planilha-china");
    expect(itens[0]!.ncm).toMatch(/^8516/);
    expect(itens[0]!.ncmEmbarqueStatus).toBe("sem-ncm-coluna");
  });

  it("item 9 cot72: referência média da planilha China vence Siscomex", async () => {
    const linhas: LinhaCrua[] = [
      {
        descOriginal:
          "HY-5104;6件套硅胶空气炸锅（180g);HY-5104 — Kit 6 peças de silicone para Air Fryer (180g)",
        ncm: null,
        qtd: 7500,
        pesoBrutoKg: 1400,
        pesoLiqKg: 1288,
        fobTotalUS: 653.66,
        fobUnitarioUS: null,
      },
    ];

    const { itens, classificacaoCache } = await montarItens(linhas, buildStateComPlanilhaChina());

    expect(classificacaoCache.trace?.[0]?.decisao).toBe("planilha-china");
    expect(itens[0]!.ncmFonte).toBe("planilha-china");
    expect(itens[0]!.ncm).toBe("85167910");
    expect(itens[0]!.ncm).not.toBe("69022010");
  });

  it("visão com foto pode vetar família grotesca da planilha China", async () => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "gemini";
    process.env.CLASSIFICACAO_NCM_VISION = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            sugestao: {
              ncm: "84231000",
              descricaoOficial: "Balanças para pessoas, incluindo as balanças para bebês; balanças de uso doméstico",
              confianca: 0.94,
              justificativaRGI: "Vejo balança de gancho/suspensa na imagem.",
            },
            alternativas: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const linhas: LinhaCrua[] = [
      {
        descOriginal: "HY-97;挂钩秤;Balança de gancho portátil",
        ncm: null,
        qtd: 100,
        pesoBrutoKg: 10,
        pesoLiqKg: 9,
        fobTotalUS: 50,
        fobUnitarioUS: null,
        fotoBase64: "Zm90by1kZS1iYWxhbmNh",
        fotoMime: "image/png",
      },
    ];

    const { itens, classificacaoCache } = await montarItens(linhas, buildStateComPlanilhaChina(), {
      gravarCacheClassificacao: false,
    });

    expect(classificacaoCache.trace?.[0]?.decisao).toBe("visao-vetou-planilha-china");
    expect(itens[0]!.ncmFonte).toBe("gemini");
    expect(itens[0]!.ncm).toMatch(/^8423/);
    expect(itens[0]!.ncm).not.toMatch(/^(8471|8517)/);
    expect(itens[0]!.ncmAvisos?.join(" ")).toMatch(/Visão prevaleceu — conferir/i);
  });

  it("visão 0.80 pode vetar lavadora da planilha China quando valida hit com foto", async () => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "gemini";
    process.env.CLASSIFICACAO_NCM_VISION = "1";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            sugestao: {
              ncm: "84512100",
              descricaoOficial: "Máquinas de secar roupa, de capacidade não superior a 10 kg",
              confianca: 0.8,
              justificativaRGI: "Vejo secadora de roupas portátil na imagem.",
            },
            alternativas: [{ ncm: "84211910", descricaoOficial: "Secadores centrífugos" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );

    const linhas: LinhaCrua[] = [
      {
        descOriginal:
          "HY-5123;智能烘干机;Secadora inteligente de uso doméstico, capacidade não superior a 10 kg (peso de roupa seca)",
        ncm: null,
        qtd: 1000,
        pesoBrutoKg: 320,
        pesoLiqKg: 294.4,
        fobTotalUS: 1789.7,
        fobUnitarioUS: null,
        fotoBase64: "Zm90by1kZS1zZWNhZG9yYQ==",
        fotoMime: "image/png",
      },
    ];

    const { itens, classificacaoCache } = await montarItens(linhas, buildStateComPlanilhaChina(), {
      gravarCacheClassificacao: false,
    });

    expect(classificacaoCache.trace?.[0]?.decisao).toBe("visao-vetou-planilha-china");
    expect(itens[0]!.ncmFonte).toBe("gemini");
    expect(itens[0]!.ncm).toBe("84512100");
    expect(itens[0]!.ncm).not.toBe("84501200");
    expect(itens[0]!.ncmAvisos?.join(" ")).toMatch(/Visão prevaleceu — conferir/i);
  });
});
