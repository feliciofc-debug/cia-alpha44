/**
 * Gate embarque 89 — linha TOTAL não vira item; FOB/NCM declarados prevalecem.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  FOB_KG_FONTE_CLIENTE_DECLARADO,
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
const FIXTURE_89 = readFileSync(join(ROOT, "tools/fixtures/packing-89-total-row.xlsx"));
const FIXTURE_92 = readFileSync(join(ROOT, "tools/fixtures/fatura-92-real.xls"));

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

function stateTeste(): AppState {
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
    cambio: 5.2,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    cliente: "embarque 89 real",
    benefFiscal: "NENHUM" as const,
    moeda: "USD" as const,
    incoterm: "FOB",
    origem: "CN",
    destino: "SP",
    despesas: [],
    outrasDespesasBaseBRL: 0,
    params: { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04 },
    itens,
  };
}

describe("gate embarque 89 — total row + FOB/NCM declarados", () => {
  it("descarta TOTAL, detecta NCM sem cabeçalho e preserva FOB declarado", async () => {
    const parsed = await parseSupplierFile(FIXTURE_89);

    expect(parsed.totalLinhas).toBe(21);
    expect(parsed.linhasTotaisDescartadas).toBe(1);
    expect(parsed.metaNcmEmbarque?.colunaDetectada).toBe(true);
    expect(parsed.metaNcmEmbarque?.linhasComNcmColuna).toBe(21);
    expect(parsed.linhas.some((l) => /^total\s*:?\s*$/i.test(l.descOriginal))).toBe(false);
    expect(parsed.linhas.some((l) => /^\d+(?:[.,]\d+)?$/.test(l.descOriginal))).toBe(false);
    expect(parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? l.pesoLiqKg ?? 0), 0)).toBeCloseTo(18721, 2);
    expect(parsed.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0)).toBeCloseTo(39656.8, 2);

    expect(parsed.linhas.map((l) => l.ncm)).toEqual(
      expect.arrayContaining(["95079000", "39269090", "42029200", "94054200", "94017900", "39169010"]),
    );

    const state = stateTeste();
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });
    const calc = calcularCotacao(cotacaoTeste(itens), state);

    expect(calc.itens).toHaveLength(21);
    expect(calc.resultado.entrada.fobTotalUS).toBeCloseTo(39656.8, 2);
    expect(calc.itens.every((it) => it.fobKgFonte === FOB_KG_FONTE_CLIENTE_DECLARADO)).toBe(true);
    expect(calc.itens[0]!.ncm).toBe("95079000");
    expect(calc.itens[1]!.ncm).toBe("39269090");
    expect(calc.itens[2]!.ncm).toBe("42029200");
    expect(calc.itens[3]!.ncm).toBe("94054200");
    expect(calc.itens[4]!.ncm).toBe("94017900");
    expect(calc.itens[5]!.ncm).toBe("39169010");
  });

  it("não altera fixture sem FOB/KG e TTL FOB declarados", async () => {
    const parsed = await parseSupplierFile(FIXTURE_92);
    const state = stateTeste();
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });
    const calc = calcularCotacao(cotacaoTeste(itens), state);

    expect(parsed.colunas.some((c) => c.campo === "fob_kg" && /fob\s*\/?\s*kg/i.test(c.header))).toBe(false);
    expect(calc.itens.some((it) => it.fobKgFonte === FOB_KG_FONTE_CLIENTE_DECLARADO)).toBe(false);
    expect(calc.resultado.entrada.fobTotalUS).toBeGreaterThan(77000);
    expect(calc.resultado.entrada.fobTotalUS).toBeLessThan(77850);
  });
});
