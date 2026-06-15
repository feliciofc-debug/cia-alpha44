import { beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "tenant-a";
const TENANT_B = "tenant-b";
const COTACAO_ID = "cot-lote-test";

type ItemRow = {
  id: string;
  ordem: number;
  descOriginal: string;
  descPt: string;
  descDuimp: string;
  ncm: string;
  ncmCandidatos: unknown[];
  pesoBrutoKg: null;
  pesoLiqKg: number;
  qtd: number;
  fobUnitarioUS: null;
  fobTotalUS: number;
  aliquotas: Record<string, never>;
  aliquotasOverride: boolean;
  benchmark: null;
  calibracao: null;
  risco: { canal: string };
  anuencia: unknown[];
  antidumping: boolean;
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
  params: { markupPct: number };
  status: string;
  totalBRL: number;
  totalUS: number;
  canalPredominante: string;
  resultadoCalculo: { totalBRL: number; totalUS: number };
  calculadoEm: Date;
  criadoEm: Date;
  itens: ItemRow[];
  despesas: unknown[];
};

const store = vi.hoisted(() => ({
  row: null as CotacaoRow | null,
  cacheCallCount: 0,
  cacheFailAt: -1,
  txItemUpdates: 0,
  resultadoMock: {
    totalBRL: 1000,
    totalUS: 200,
    entrada: { impostosEntradaTotal: 100, antidumpingBRL: 0 },
    saida: {
      markup: 60,
      impostosSaidaTotal: 50,
      taxasLocaisTotalBRL: 10,
      csll: 5,
      irrf: 3,
    },
  },
}));

function makeItemRow(ordem: number, ncm: string, meta: Record<string, unknown> = {}): ItemRow {
  return {
    id: `item-${ordem}`,
    ordem,
    descOriginal: `Produto ${ordem}`,
    descPt: `Produto ${ordem}`,
    descDuimp: `Produto ${ordem}`,
    ncm,
    ncmCandidatos: [],
    pesoBrutoKg: null,
    pesoLiqKg: 1,
    qtd: 1,
    fobUnitarioUS: null,
    fobTotalUS: 10,
    aliquotas: {},
    aliquotasOverride: false,
    benchmark: null,
    calibracao: null,
    risco: { canal: "AMARELO_TECNICO" },
    anuencia: [],
    antidumping: false,
    meta: { compatibilidadeProduto: "revisar", ...meta },
  };
}

function makeCotacaoRow(itens: ItemRow[]): CotacaoRow {
  return {
    id: COTACAO_ID,
    tenantId: `tid-${TENANT_A}`,
    empresaTrade: "",
    cliente: "Lote NCM smoke",
    benefFiscal: "NENHUM",
    moeda: "USD",
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
    origem: "CN",
    destino: "BR",
    ufEmpresa: "AL",
    regimeIcms: "AL_DIFERIDO",
    icmsSaidaManualFlag: false,
    avisosFiscais: [],
    outrasDespesasBaseBRL: null,
    params: { markupPct: 0.06 },
    status: "CALCULADA",
    totalBRL: 1000,
    totalUS: 200,
    canalPredominante: "AMARELO_TECNICO",
    resultadoCalculo: {
      totalBRL: 1000,
      totalUS: 200,
      entrada: { impostosEntradaTotal: 100, antidumpingBRL: 0 },
      saida: {
        markup: 60,
        impostosSaidaTotal: 50,
        taxasLocaisTotalBRL: 10,
        csll: 5,
        irrf: 3,
      },
    },
    calculadoEm: new Date(),
    criadoEm: new Date(),
    itens,
    despesas: [],
  };
}

function seedMix45e5() {
  const itens = [
    ...Array.from({ length: 45 }, (_, i) => makeItemRow(i, "94052100")),
    ...Array.from({ length: 5 }, (_, i) => makeItemRow(45 + i, "00000000")),
  ];
  store.row = makeCotacaoRow(itens);
}

vi.mock("../src/auth/tenant.js", () => ({
  ensureTenant: vi.fn(async (slug: string) => `tid-${slug}`),
}));

vi.mock("../src/services/cotacao.js", () => ({
  calcularCotacao: vi.fn((cotacao: { itens: unknown[] }) => ({
    resultado: store.resultadoMock,
    itens: cotacao.itens,
  })),
}));

const mockState = {
  comexSeed: [],
  benchmarkIndex: { byNcm: new Map(), byPrefix: new Map() },
  tecSource: { lookup: () => null },
  ncmCatalog: { has: () => true, get: () => null },
  provider: {},
  ocr: {},
  siscomex: {},
};

vi.mock("../src/state.js", () => ({
  getState: vi.fn(() => mockState),
}));

vi.mock("../src/services/classificacao-cache.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/services/classificacao-cache.js")>();
  return {
    ...actual,
    versoesClassificacaoCacheAtual: vi.fn(async () => ({
      promptVersion: "test-prompt",
      catalogVersion: "test-catalog",
    })),
    salvarClassificacaoCacheHumano: vi.fn(async (_i, _v, _r, opts?) => {
      store.cacheCallCount++;
      if (opts?.strict && store.cacheFailAt > 0 && store.cacheCallCount >= store.cacheFailAt) {
        throw new Error("cache strict fail simulado");
      }
    }),
  };
});

vi.mock("@cia/db", () => {
  const tx = {
    item: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { meta: unknown } }) => {
        store.txItemUpdates++;
        const it = store.row?.itens.find((i) => i.id === where.id);
        if (it) it.meta = data.meta as Record<string, unknown>;
      }),
    },
    classificacaoCache: {
      upsert: vi.fn(),
    },
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
        update: vi.fn(async ({ data }: { data: { resultadoCalculo?: unknown } }) => {
          if (store.row && data.resultadoCalculo) {
            store.row.resultadoCalculo = data.resultadoCalculo as CotacaoRow["resultadoCalculo"];
          }
          return store.row;
        }),
      },
      item: tx.item,
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => {
        const snapshot = JSON.parse(JSON.stringify(store.row)) as CotacaoRow;
        store.txItemUpdates = 0;
        try {
          await fn(tx);
        } catch (e) {
          store.row = snapshot;
          throw e;
        }
      }),
    },
  };
});

describe("confirmarNcmItensLote", () => {
  beforeEach(() => {
    store.row = null;
    store.cacheCallCount = 0;
    store.cacheFailAt = -1;
    store.txItemUpdates = 0;
    process.env.DATABASE_URL = "postgresql://mock/mock";
    vi.clearAllMocks();
  });

  it("mix 45 elegíveis + 5× 00000000 → aprovados=45, pendentes≥5", async () => {
    seedMix45e5();
    const { confirmarNcmItensLote } = await import("../src/services/cotacoes-persist.js");

    const r = await confirmarNcmItensLote(COTACAO_ID, TENANT_A, "test@lote", mockState as never);

    expect(r).not.toBeNull();
    expect(r!.aprovados).toBe(45);
    expect(r!.pendentes).toBeGreaterThanOrEqual(5);
    expect(store.txItemUpdates).toBe(45);
    for (let i = 0; i < 45; i++) {
      expect(store.row!.itens[i]!.meta.ncmRevisadoHumano).toBe(true);
    }
    for (let i = 45; i < 50; i++) {
      expect(store.row!.itens[i]!.meta.ncmRevisadoHumano).toBeUndefined();
    }
  });

  it("re-chamar → aprovados=0, pulados=45, sem nova gravação", async () => {
    seedMix45e5();
    const { confirmarNcmItensLote } = await import("../src/services/cotacoes-persist.js");

    await confirmarNcmItensLote(COTACAO_ID, TENANT_A, "test@lote", mockState as never);
    store.cacheCallCount = 0;
    store.txItemUpdates = 0;

    const r2 = await confirmarNcmItensLote(COTACAO_ID, TENANT_A, "test@lote", mockState as never);

    expect(r2!.aprovados).toBe(0);
    expect(r2!.pulados).toBe(45);
    expect(store.cacheCallCount).toBe(0);
    expect(store.txItemUpdates).toBe(0);
  });

  it("cross-tenant: tenant B no :id de A → null (404 via rota)", async () => {
    seedMix45e5();
    const { confirmarNcmItensLote } = await import("../src/services/cotacoes-persist.js");

    const r = await confirmarNcmItensLote(COTACAO_ID, TENANT_B, "evil@tenant", mockState as never);

    expect(r).toBeNull();
    expect(store.txItemUpdates).toBe(0);
  });

  it("rollback: cache strict falha no meio → nenhuma meta persiste", async () => {
    seedMix45e5();
    store.cacheFailAt = 3;
    const { confirmarNcmItensLote } = await import("../src/services/cotacoes-persist.js");

    await expect(confirmarNcmItensLote(COTACAO_ID, TENANT_A, "test@lote", mockState as never)).rejects.toThrow(
      /cache strict fail/,
    );

    for (let i = 0; i < 45; i++) {
      expect(store.row!.itens[i]!.meta.ncmRevisadoHumano).toBeUndefined();
    }
  });
});
