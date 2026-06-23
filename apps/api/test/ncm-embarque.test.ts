import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  buildBenchmarkIndex,
  loadComexSeed,
  criarNcmCatalog,
  loadNcmVigenteCache,
  type LinhaCrua,
} from "@cia/pipeline";
import { montarItens } from "../src/services/cotacao.js";
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

describe("ncmEmbarque — upload classificar", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
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
});
