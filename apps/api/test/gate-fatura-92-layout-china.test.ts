/**
 * Gate fatura 92 — layout China 巴西发票模板 deve trazer NCM soberano da coluna cliente.
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
  parsePlanilhaRows,
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
const FIXTURE = JSON.parse(
  readFileSync(join(ROOT, "tools/fixtures/fatura-92-layout-china.json"), "utf8"),
) as { sheet: string; header: string[]; rows: unknown[][] };
const REAL_XLS = readFileSync(join(ROOT, "tools/fixtures/fatura-92-real.xls"));

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

async function montarComProvider(linhas: Parameters<typeof montarItens>[0], provider: LlmProvider) {
  return montarItens(linhas, stateTeste(provider));
}

function cotacaoTeste(itens: Awaited<ReturnType<typeof montarItens>>["itens"]) {
  return {
    cambio: 5,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    cliente: "fatura 92 real",
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

describe("gate fatura 92 — layout China embarque 92", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("parse + montagem preserva NCM da coluna como planilha-cliente", async () => {
    const parsed = parsePlanilhaRows([FIXTURE.header, ...FIXTURE.rows], FIXTURE.sheet);
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

    const { itens } = await montarComProvider(
      parsed.linhas.map((l) => ({
        descOriginal: l.descricao,
        ncm: l.ncm,
        qtd: l.qtd,
        qtdCaixas: l.qtdCaixas ?? null,
        qtdPorCaixa: l.qtdPorCaixa ?? null,
        pesoBrutoKg: l.pesoBrutoKg,
        pesoLiqKg: l.pesoLiqKg,
        fobUnitarioUS: l.precoUnitario,
        fobTotalUS: l.fobTotalUS,
        valoresSemCabecalho: l.valoresSemCabecalho,
        material: l.material ?? null,
        uso: l.uso ?? null,
      })),
      provider,
    );

    expect(itens).toHaveLength(13);
    expect(itens[0]!.qtd).toBe(500);
    expect(itens[1]!.qtd).toBe(210);
    expect(itens[0]!.pesoBrutoKg).toBe(11500);
    expect(itens[1]!.pesoBrutoKg).toBe(4830);
    expect(itens[0]!.fobUnitarioUS).toBe(109);
    expect(itens[1]!.fobUnitarioUS).toBe(109);
    expect(itens[0]!.fobTotalUS).toBeCloseTo(54500, 2);
    expect(itens[1]!.fobTotalUS).toBeCloseTo(22890, 2);
    expect(itens[0]!.ncm).toBe("87116000");
    expect(itens[1]!.ncm).toBe("87116000");
    expect(itens[2]!.ncm).toBe("87141000");
    expect(itens[4]!.ncm).toBe("73181500");

    for (const it of itens) {
      expect(["planilha-cliente", "planilha-cliente-familia"]).toContain(it.ncmFonte);
      expect(it.ncmFonte).not.toBe("gemini");
      expect(it.ncmFonte).not.toBe("ia");
    }
  });

  it("arquivo real .xls seleciona aba da fatura e calcula patinetes sem digitação", async () => {
    const parsed = await parseSupplierFile(REAL_XLS);
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

    expect(parsed.abaUsada).toBe("巴西发票模板");
    expect(parsed.abasCandidatas?.find((a) => a.aba === "巴西发票模板")?.pontuacao ?? 0).toBeGreaterThan(
      parsed.abasCandidatas?.find((a) => a.aba === "巴西产品信息")?.pontuacao ?? -1,
    );
    expect(parsed.totalLinhas).toBe(13);

    const state = stateTeste(provider);
    const { itens } = await montarItens(parsed.linhas, state);
    expect(itens).toHaveLength(13);
    expect(itens[0]!.qtd).toBe(500);
    expect(itens[1]!.qtd).toBe(210);
    expect(itens[0]!.pesoBrutoKg).toBe(11500);
    expect(itens[1]!.pesoBrutoKg).toBe(4830);
    expect(itens[0]!.ncm).toBe("87116000");
    expect(itens[1]!.ncm).toBe("87116000");
    expect(itens[0]!.ncmFonte).toBe("planilha-cliente");
    expect(itens[1]!.ncmFonte).toBe("planilha-cliente");
    expect(itens[0]!.fobUnitarioUS).toBe(109);
    expect(itens[1]!.fobUnitarioUS).toBe(109);
    expect(itens[0]!.fobTotalUS).toBeCloseTo(54500, 2);
    expect(itens[1]!.fobTotalUS).toBeCloseTo(22890, 2);

    const calculada = calcularCotacao(cotacaoTeste(itens), state);
    const somaItens = calculada.itens.reduce((s, it) => s + (it.fobTotalUS ?? 0), 0);
    expect(calculada.itens[0]!.fobKgFonte).toBe("preco-custo");
    expect(calculada.itens[1]!.fobKgFonte).toBe("preco-custo");
    expect(calculada.resultado.entrada.fobTotalUS).toBeCloseTo(somaItens, 2);
    expect(calculada.resultado.entrada.fobTotalUS).toBeGreaterThan(77000);
    expect(calculada.resultado.entrada.fobTotalUS).toBeLessThan(77850);
  });
});
