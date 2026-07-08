/**
 * Gate fatura 90 — códigos aduaneiros chineses de 10 dígitos na coluna NCM.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  parseSupplierFile,
} from "@cia/pipeline";
import { calcularCotacao, montarItens } from "../src/services/cotacao.js";
import type { AppState } from "../src/state.js";
import type { ClassifyItemInput, LlmProvider } from "../src/llm/types.js";

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
const REAL_XLS = readFileSync(join(ROOT, "tools/fixtures/fatura-90-hs6.xls"));

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

function cotacaoTeste(itens: Awaited<ReturnType<typeof montarItens>>["itens"]) {
  return {
    cambio: 5,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    cliente: "fatura 90 hs6",
    benefFiscal: "NENHUM" as const,
    moeda: "USD" as const,
    incoterm: "FOB",
    origem: "CN",
    destino: "SP",
    despesas: [],
    params: {
      markupPct: 0.06,
      pisSaida: 0.0065,
      cofinsSaida: 0.03,
      icmsSaida: 0.18,
      csllSobreMarkup: 0.09,
      irrfAliq: 0.015,
      irrfBaseNotaPct: 1,
      ipiTetoAliqMedia: 0.15,
      icmsEntrada: 0,
    },
    itens,
  };
}

describe("gate fatura 90 — âncora HS6 de código chinês", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("parse + montagem resolvem NCM pelo HS6 da coluna chinesa", async () => {
    const parsed = await parseSupplierFile(REAL_XLS);
    expect(parsed.totalLinhas).toBe(3);
    expect(parsed.metaNcmEmbarque?.linhasComNcmColuna).toBe(3);

    expect(parsed.linhas.map((l) => l.ncm)).toEqual(["9603290090", "9506919000", "7020009990"]);
    expect(parsed.linhas.map((l) => l.qtd)).toEqual([3960, 500, 375]);
    expect(parsed.linhas.map((l) => l.pesoBrutoKg)).toEqual([3960, 4200, 38.57]);

    const provider: LlmProvider = {
      nome: "mock-vazio",
      disponivel: false,
      classify: async (itens: ClassifyItemInput[]) =>
        itens.map((i) => ({
          descPt: i.descOriginal,
          descDuimp: `${i.descOriginal} — pendente`,
          ncmCandidatos: [],
        })),
    };

    const state = stateTeste(provider);
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });

    expect(itens).toHaveLength(3);
    expect(itens.map((it) => it.ncm)).toEqual(["96032900", "95069100", "70200090"]);
    expect(itens.map((it) => it.ncmFonte)).toEqual([
      "planilha-cliente-hs6",
      "planilha-cliente-hs6",
      "planilha-cliente-hs6",
    ]);
    expect(itens.some((it) => it.ncm?.startsWith("9032"))).toBe(false);

    for (const it of itens) {
      expect(it.ncmAvisos?.join(" ")).toMatch(/código aduaneiro chinês \(HS6 \d{6}\)/i);
    }

    const calculada = calcularCotacao(cotacaoTeste(itens), state);
    expect(calculada.resultado.entrada.fobTotalUS).toBeGreaterThan(11000);
    expect(calculada.resultado.entrada.fobTotalUS).toBeLessThan(12000);
    expect(calculada.resultado.entrada.fobTotalUS).toBeCloseTo(11892, 2);
  });
});
