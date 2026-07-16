/**
 * Gate d003 — planilha sem cabeçalho: mapeamento matemático prevalece sobre IA.
 */
import { describe, expect, it, vi } from "vitest";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  FOB_KG_FONTE_CLIENTE_DECLARADO,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  parseSupplierFile,
  temCaractereCjk,
} from "@cia/pipeline";
import { ingerirArquivo } from "../src/services/ingest.js";
import { calcularCotacao, montarItens } from "../src/services/cotacao.js";
import type { AppState } from "../src/state.js";
import type { ClassifyItemInput, LlmProvider } from "../src/llm/types.js";
import type { Cotacao } from "@cia/shared";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const FIXTURE_D003 = readFileSync(join(ROOT, "tools/fixtures/d003.xlsx"));

const REFS_D003 = [
  "TX3044-C11",
  "TX2954-C11",
  "TX2688-C11",
  "TX2991-C01",
  "TX2798-C01",
  "XZ-008-10M",
  "TX3051-C06",
  "TX2995-C06",
  "TX2422-C03",
  "TX2423-C03",
  "TX2424-C03",
  "TX2982-C03",
  "TX2650-C03",
];

/** Descrições col2 que iniciam com código — regressão: não podem virar REF — REF. */
const SPOT_CHECKS_CODIGO_INICIO = [
  { ref: "TX2954-C11", trecho: "8-696灶炉片" },
  { ref: "XZ-008-10M", trecho: "XZ-008银方格油烟贴" },
  { ref: "TX3051-C06", trecho: "CB-2#1平方2米铜插片" },
  { ref: "TX2995-C06", trecho: "CB-2#1平方2米铜插片" },
] as const;

/** Simula IA que mapeia col7 (preço unitário) como FOB — bug em produção. */
const mapaIaErrado = async () => ({
  descricao: 2,
  qtd: 5,
  preco: 7,
  fob: 7,
  peso_bruto: 9,
  peso: 11,
});

const providerD003: LlmProvider = {
  nome: "mock-d003-gate",
  disponivel: true,
  classify: async (itens: ClassifyItemInput[]) =>
    itens.map((i) => ({
      descPt: `Produto — ${i.descOriginal.slice(0, 48)}`,
      descDuimp: "Mercadoria importada",
      ncmCandidatos: [{ ncm: "85167910", confianca: 0.9, justificativa: "gate d003" }],
    })),
};

function stateTeste(provider: LlmProvider): AppState {
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    tecSource: criarTecSource(loadTecCache()),
    siscomex: { lookup: () => null },
    ocr: null,
    provider,
  } as unknown as AppState;
}

function cotacaoTeste(itens: Cotacao["itens"]): Cotacao {
  return {
    cliente: "gate d003",
    benefFiscal: "NENHUM",
    moeda: "USD",
    cambio: 5.5,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    origem: "CN",
    destino: "SP",
    incoterm: "FOB",
    despesas: [],
    outrasDespesasBaseBRL: 0,
    params: { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04, ipiAliqSaida: 0 },
    itens,
  };
}

function refsDaPlanilha(): string[] {
  const wb = XLSX.read(FIXTURE_D003, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1!, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][];
  return rows.map((r) => String(r[0] ?? "").trim()).filter(Boolean);
}

describe("gate d003 — mapeamento matemático sem cabeçalho", () => {
  it("13 itens, Σ FOB US$ 599.700 e pesos corretos mesmo com IA errada", async () => {
    const ocr = { disponivel: false, extrair: async () => ({ texto: "", paginas: 0, avisos: [] }) };
    const ingested = await ingerirArquivo("d003.xlsx", FIXTURE_D003, ocr);

    expect(ingested.totalLinhas).toBe(13);
    expect(ingested.avisos.some((a) => /matemática/i.test(a))).toBe(true);

    const sumFob = ingested.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    const sumBruto = ingested.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    const sumLiq = ingested.linhas.reduce((s, l) => s + (l.pesoLiqKg ?? 0), 0);
    expect(sumFob).toBeCloseTo(599700, 2);
    expect(sumBruto).toBeCloseTo(19120, 2);
    expect(sumLiq).toBeCloseTo(18220, 2);

    ingested.linhas.forEach((l) => {
      expect(l.fobUnitarioUS).not.toBeNull();
      expect(l.fobTotalUS).not.toBeNull();
      expect((l.fobTotalUS ?? 0)).toBeGreaterThan((l.fobUnitarioUS ?? 0));
    });
  }, 60000);

  it("parseSupplierFile com IA errada ainda retorna FOB declarado da col8", async () => {
    const parsed = await parseSupplierFile(FIXTURE_D003, { mapearColunasIA: mapaIaErrado });
    const sumFob = parsed.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    expect(parsed.totalLinhas).toBe(13);
    expect(sumFob).toBeCloseTo(599700, 2);
  });

  it("13/13 descrições preservam chinês da col2 — nunca REF duplicado", async () => {
    const parsed = await parseSupplierFile(FIXTURE_D003, { mapearColunasIA: mapaIaErrado });
    const refs = refsDaPlanilha();
    expect(parsed.linhas).toHaveLength(13);
    expect(refs).toEqual(REFS_D003);

    const wb = XLSX.read(FIXTURE_D003, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1!, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    for (let i = 0; i < parsed.linhas.length; i++) {
      const ref = refs[i]!;
      const descCol2 = String(rows[i]![2] ?? "").trim();
      const linha = parsed.linhas[i]!;

      expect(linha.descOriginal).not.toBe(ref);
      expect(linha.descOriginal).not.toBe(`${ref} — ${ref}`);
      expect(temCaractereCjk(linha.descOriginal)).toBe(true);
      expect(linha.descOriginal).toContain(descCol2.slice(0, 6));
    }

    for (const spot of SPOT_CHECKS_CODIGO_INICIO) {
      const idx = REFS_D003.indexOf(spot.ref);
      const item = parsed.linhas[idx]!;
      expect(item.descOriginal).toContain(spot.trecho);
      expect(item.descOriginal).not.toBe(`${spot.ref} — ${spot.ref}`);
    }
  }, 60000);

  it("classificação orgânica preenche NCM em 13/13 — zero 00000000", async () => {
    const parsed = await parseSupplierFile(FIXTURE_D003, { mapearColunasIA: mapaIaErrado });
    const state = stateTeste(providerD003);
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });

    expect(itens).toHaveLength(13);
    expect(itens.every((it) => it.ncm && it.ncm !== "00000000")).toBe(true);

    for (const spot of SPOT_CHECKS_CODIGO_INICIO) {
      const idx = REFS_D003.indexOf(spot.ref);
      const it = itens[idx]!;
      expect(it.ncm).not.toBe("00000000");
      expect(it.descOriginal).toContain(spot.trecho);
    }
  }, 90000);

  it("calcularCotacao E2E — FOB DI = 599.700 com fonte planilha-cliente (FOB declarado)", async () => {
    const parsed = await parseSupplierFile(FIXTURE_D003, { mapearColunasIA: mapaIaErrado });
    const state = stateTeste(providerD003);
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });
    const calc = calcularCotacao(cotacaoTeste(itens), state);

    expect(calc.itens).toHaveLength(13);
    expect(calc.resultado.entrada.fobTotalUS).toBeCloseTo(599700, 2);
    expect(calc.itens.every((it) => it.fobKgFonte === FOB_KG_FONTE_CLIENTE_DECLARADO)).toBe(true);

    const sumDeclarado = parsed.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    expect(sumDeclarado).toBeCloseTo(599700, 2);

    for (const it of calc.itens) {
      expect(it.fobEmbarqueUS).toBeCloseTo(it.fobTotalUS, 2);
    }
  }, 90000);
});
