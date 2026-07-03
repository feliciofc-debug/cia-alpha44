import { beforeEach, describe, expect, it, vi } from "vitest";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  defaultBenchmarkPlanilhaPath,
  fobKgParaPreenchimento,
  historicoFromPlanilhaSeed,
  loadBenchmarkPlanilha,
  loadComexSeed,
  loadNcmVigenteCache,
  substituirHistoricoBenchmark,
} from "@cia/pipeline";
import type { AppState } from "../src/state.js";

const TENANT = "tenant-edit-ncm";
const COTACAO_ID = "cot-edit-ncm";

type ItemRow = {
  id: string;
  ordem: number;
  descOriginal: string;
  descPt: string;
  descDuimp: string;
  ncm: string;
  ncmCandidatos: unknown;
  pesoBrutoKg: number | null;
  pesoLiqKg: number;
  qtd: number | null;
  fobUnitarioUS: number | null;
  fobTotalUS: number;
  fobKgManual: number | null;
  aliquotas: Record<string, number>;
  aliquotasOverride: boolean;
  benchmark: unknown;
  calibracao: unknown;
  risco: unknown;
  anuencia: unknown[];
  antidumping: boolean;
  fotoPath?: string | null;
  meta: Record<string, unknown>;
};

type CotacaoRow = {
  id: string;
  tenantId: string;
  empresaTrade: string;
  cliente: string;
  benefFiscal: string;
  moeda: string;
  moedaPlanilha: null;
  cambioEurUsd: null;
  cambioEurUsdData: null;
  cambioEurUsdFonte: null;
  cambio: number;
  freteTotalUS: number;
  adicionaisVaUS: number;
  reducaoBaseUS: number;
  siscomex: number;
  antidumpingBRL: number;
  incoterm: string;
  origem: string;
  destino: string;
  ufEmpresa: string;
  regimeIcms: string;
  icmsSaidaManualFlag: boolean;
  avisosFiscais: unknown[];
  outrasDespesasBaseBRL: null;
  params: typeof PARAMS_SAIDA_PADRAO;
  status: string;
  totalBRL: number | null;
  totalUS: number | null;
  canalPredominante: string | null;
  resultadoCalculo: unknown;
  calculadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
  itens: ItemRow[];
  despesas: unknown[];
};

const store = vi.hoisted(() => ({
  row: null as CotacaoRow | null,
  cache: new Map<string, { chave: string; promptVersion: string; catalogVersion: string; resultado: unknown; confirmadoHumano: boolean; hitCount?: number }>(),
  itemUpdates: 0,
}));

vi.mock("../src/auth/tenant.js", () => ({
  ensureTenant: vi.fn(async (slug: string) => `tid-${slug}`),
}));

vi.mock("@cia/db", () => {
  const itemUpdate = vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    store.itemUpdates++;
    const item = store.row?.itens.find((it) => it.id === where.id);
    if (item) Object.assign(item, data);
    return item;
  });
  const cotacaoUpdate = vi.fn(async ({ data }: { data: Partial<CotacaoRow> }) => {
    if (store.row) Object.assign(store.row, data);
    return store.row;
  });
  const classificacaoCache = {
    findUnique: vi.fn(async ({ where }: { where: { chave: string } }) => store.cache.get(where.chave) ?? null),
    update: vi.fn(async ({ where, data }: { where: { chave: string }; data: { hitCount?: { increment: number } } }) => {
      const row = store.cache.get(where.chave);
      if (row && data.hitCount?.increment) row.hitCount = (row.hitCount ?? 0) + data.hitCount.increment;
      return row;
    }),
    upsert: vi.fn(async ({ where, create, update }: { where: { chave: string }; create: never; update: never }) => {
      const next = store.cache.has(where.chave)
        ? { ...store.cache.get(where.chave)!, ...(update as object) }
        : { ...(create as object), chave: where.chave };
      store.cache.set(where.chave, next as never);
      return next;
    }),
  };
  const tx = {
    item: { update: itemUpdate },
    cotacao: { update: cotacaoUpdate },
    classificacaoCache,
  };
  return {
    prisma: {
      cotacao: {
        findFirst: vi.fn(async ({ where }: { where: { id?: string; tenantId?: string } }) => {
          if (!store.row) return null;
          if (where.id && store.row.id !== where.id) return null;
          if (where.tenantId && store.row.tenantId !== where.tenantId) return null;
          return store.row;
        }),
        update: cotacaoUpdate,
      },
      item: { update: itemUpdate },
      classificacaoCache,
      $transaction: vi.fn(async (fn: (txArg: typeof tx) => Promise<void>) => fn(tx)),
    },
  };
});

function carregarState(providerClassify = vi.fn(async () => [])): AppState {
  const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
  if (!seed) throw new Error("Seed planilha China ausente");
  substituirHistoricoBenchmark(historicoFromPlanilhaSeed(seed));
  const comex = loadComexSeed();
  const catalog = criarNcmCatalog(loadNcmVigenteCache());
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto, {
      planilhaPeriodo: seed.periodoReferencia ?? null,
      comexstatPeriodo: comex.periodoReferencia ?? null,
    }),
    ncmCatalog: catalog,
    tecSource: {
      buscar: () => ({
        encontrado: true,
        fonte: "teste",
        aliquotas: { ii: 0.126, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
      }),
      buscarAsync: async () => ({
        encontrado: true,
        fonte: "teste",
        aliquotas: { ii: 0.126, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
      }),
    },
    siscomex: { lookup: () => null },
    ocr: null,
    provider: { nome: "mock-test", disponivel: false, classify: providerClassify },
  } as unknown as AppState;
}

function makeItem(descOriginal = "HY-97 — 挂钩秤"): ItemRow {
  return {
    id: "item-0",
    ordem: 0,
    descOriginal,
    descPt: descOriginal,
    descDuimp: descOriginal,
    ncm: "00000000",
    ncmCandidatos: [],
    pesoBrutoKg: 100,
    pesoLiqKg: 90,
    qtd: 10,
    fobUnitarioUS: null,
    fobTotalUS: 10,
    fobKgManual: null,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icmsEntrada: 0 },
    aliquotasOverride: false,
    benchmark: null,
    calibracao: null,
    risco: null,
    anuencia: [],
    antidumping: false,
    meta: { ncmFonte: "gemini", compatibilidadeProduto: "revisar" },
  };
}

function seedCotacao(item = makeItem()) {
  store.row = {
    id: COTACAO_ID,
    tenantId: `tid-${TENANT}`,
    empresaTrade: "Alpha 44",
    cliente: "Teste NCM inline",
    benefFiscal: "ALAGOAS",
    moeda: "US$",
    moedaPlanilha: null,
    cambioEurUsd: null,
    cambioEurUsdData: null,
    cambioEurUsdFonte: null,
    cambio: 5,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    incoterm: "FOB",
    origem: "RJ",
    destino: "SP",
    ufEmpresa: "AL",
    regimeIcms: "AL_DIFERIDO",
    icmsSaidaManualFlag: false,
    avisosFiscais: [],
    outrasDespesasBaseBRL: null,
    params: PARAMS_SAIDA_PADRAO,
    status: "CALCULADA",
    totalBRL: null,
    totalUS: null,
    canalPredominante: null,
    resultadoCalculo: null,
    calculadoEm: null,
    criadoEm: new Date("2026-07-02T00:00:00Z"),
    atualizadoEm: new Date("2026-07-02T00:00:00Z"),
    itens: [item],
    despesas: [],
  };
}

describe("alterarNcmItem — edição soberana do operador", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://mock/mock";
    store.row = null;
    store.cache.clear();
    store.itemUpdates = 0;
    vi.clearAllMocks();
  });

  it("NCM válido atualiza item, grava cache humano, usa FOB/kg da planilha China e recalcula", async () => {
    const state = carregarState();
    seedCotacao();
    const { alterarNcmItem } = await import("../src/services/cotacoes-persist.js");

    const out = await alterarNcmItem(COTACAO_ID, TENANT, 0, "8423.89.00", state);

    expect(out).not.toBeNull();
    expect(store.row!.itens[0]!.ncm).toBe("84238900");
    expect(store.row!.itens[0]!.meta.ncmRevisadoHumano).toBe(true);
    expect(store.row!.itens[0]!.meta.ncmConfirmado).toBe("84238900");
    expect([...store.cache.values()][0]?.confirmadoHumano).toBe(true);
    const item = out!.itens[0]!;
    expect(item.ncm).toBe("84238900");
    expect(item.ncmClassificacaoCache).toBe("humano");
    expect(item.benchmark?.fonte).toBe("Histórico próprio");
    expect(fobKgParaPreenchimento(item.benchmark!)).toBeGreaterThan(0);
    expect(item.fobTotalUS).toBeCloseTo((fobKgParaPreenchimento(item.benchmark!) ?? 0) * 100, 2);
    expect(out!.resultado?.totalUS).toBeGreaterThan(0);
  });

  it("NCM inexistente na TEC retorna erro e não grava nada", async () => {
    const state = carregarState();
    seedCotacao();
    const { alterarNcmItem } = await import("../src/services/cotacoes-persist.js");

    await expect(alterarNcmItem(COTACAO_ID, TENANT, 0, "99999999", state)).rejects.toThrow(/não existe na TEC/i);

    expect(store.row!.itens[0]!.ncm).toBe("00000000");
    expect(store.cache.size).toBe(0);
    expect(store.itemUpdates).toBe(0);
  });

  it("NCM sem linha na planilha China atualiza e retorna aviso de fallback", async () => {
    const state = carregarState();
    seedCotacao(makeItem("Produto genérico sem histórico China"));
    const comex = loadComexSeed();
    const seed = loadBenchmarkPlanilha(defaultBenchmarkPlanilhaPath());
    const historico = new Set((seed?.itens ?? []).map((it) => it.ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8)));
    const ncm = comex.itens.find((it) => state.ncmCatalog.existe(it.ncm) && !historico.has(it.ncm))!.ncm;
    const { alterarNcmItem } = await import("../src/services/cotacoes-persist.js");

    const out = await alterarNcmItem(COTACAO_ID, TENANT, 0, ncm, state);

    expect(out?.itens[0]?.ncm).toBe(ncm);
    expect(out?.avisoFobKg).toMatch(/sem PREÇO FOB\/KG na planilha China/i);
  });

  it("upload novo do mesmo produto usa cache humano e não chama Gemini", async () => {
    const providerClassify = vi.fn(async () => {
      throw new Error("Gemini não deveria ser chamado");
    });
    const state = carregarState(providerClassify);
    seedCotacao();
    const { alterarNcmItem } = await import("../src/services/cotacoes-persist.js");
    const { montarItens } = await import("../src/services/cotacao.js");

    await alterarNcmItem(COTACAO_ID, TENANT, 0, "84238900", state);
    const novo = await montarItens(
      [{ descOriginal: "HY-97 — 挂钩秤", ncm: null, pesoBrutoKg: 100, pesoLiqKg: 90, fobTotalUS: 10 }],
      state,
    );

    expect(providerClassify).not.toHaveBeenCalled();
    expect(novo.itens[0]?.ncm).toBe("84238900");
    expect(novo.itens[0]?.ncmClassificacaoCache).toBe("humano");
  });

  it("custo unitário de veículo permanece após recálculo mesmo com meta FOB antigo", async () => {
    const state = carregarState();
    seedCotacao({
      ...makeItem("ES-T19A-10BLK — 滑板车T1 MAX"),
      ncm: "87116000",
      qtd: 500,
      pesoBrutoKg: 11500,
      pesoLiqKg: 10000,
      fobUnitarioUS: 140.58,
      fobTotalUS: 70290,
      meta: {
        uso: "骑行",
        ncmFonte: "planilha-cliente",
        fobKgFonte: "linha",
        fobEmbarqueUS: 70290,
      },
    });
    const { alterarCustoUnitarioVeiculoItem } = await import("../src/services/cotacoes-persist.js");

    const out = await alterarCustoUnitarioVeiculoItem(COTACAO_ID, TENANT, 0, 109, state);

    expect(out).not.toBeNull();
    expect(store.row!.itens[0]!.fobUnitarioUS).toBe(109);
    expect(store.row!.itens[0]!.fobTotalUS).toBeCloseTo(54500, 2);
    expect(out!.itens[0]!.fobUnitarioUS).toBe(109);
    expect(out!.itens[0]!.fobTotalUS).toBeCloseTo(54500, 2);
    expect(out!.resultado?.entrada.fobTotalUS).toBeCloseTo(54500, 2);
    expect(out!.avisoCustoVeiculo).toContain("Base FOB = valor de custo");
  });

  it("FOB/kg manual responde com valor salvo e cotação recalculada", async () => {
    const state = carregarState();
    seedCotacao({
      ...makeItem("Produto FOB manual"),
      ncm: "84238900",
      qtd: 1,
      pesoBrutoKg: 100,
      pesoLiqKg: 90,
      fobTotalUS: 10,
      meta: { ncmFonte: "planilha-cliente", fobKgFonte: "linha" },
    });
    const { alterarFobKgItem } = await import("../src/services/cotacoes-persist.js");

    const out = await alterarFobKgItem(COTACAO_ID, TENANT, 0, 3.25, state);

    expect(out).not.toBeNull();
    expect(store.row!.itens[0]!.fobKgManual).toBe(3.25);
    expect(out!.ordem).toBe(0);
    expect(out!.itens[0]!.fobKgManual).toBe(3.25);
    expect(out!.itens[0]!.fobTotalUS).toBeCloseTo(325, 2);
    expect(out!.fobKgFinal).toBeCloseTo(3.25, 4);
    expect(out!.resultado?.entrada.fobTotalUS).toBeCloseTo(325, 2);
  });

  it("custo unitário rejeita item não-veículo e não grava", async () => {
    const state = carregarState();
    seedCotacao({
      ...makeItem("ACC-ES-SSA001 — 减震器"),
      ncm: "87141000",
      qtd: 4,
      pesoBrutoKg: 16.4,
      pesoLiqKg: 16,
      fobUnitarioUS: 0.12,
      fobTotalUS: 0.48,
      meta: { uso: "配件", ncmFonte: "planilha-cliente" },
    });
    const { alterarCustoUnitarioVeiculoItem } = await import("../src/services/cotacoes-persist.js");

    await expect(alterarCustoUnitarioVeiculoItem(COTACAO_ID, TENANT, 0, 109, state)).rejects.toThrow(
      /não identificado como veículo/i,
    );

    expect(store.row!.itens[0]!.fobUnitarioUS).toBe(0.12);
    expect(store.row!.itens[0]!.fobTotalUS).toBe(0.48);
    expect(store.itemUpdates).toBe(0);
  });
});
