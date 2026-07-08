/**
 * Gate packing list WYC — PDF nativo com cabeçalho bilíngue EN/ZH.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  parseSupplierOcrText,
} from "@cia/pipeline";
import { montarItens } from "../src/services/cotacao.js";
import { extrairTextoPdf } from "../src/services/pdf-text.js";
import { auditarNcmsParaPdf } from "../src/services/validar-ncm-pdf.js";
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
const REAL_PDF = readFileSync(join(ROOT, "tools/fixtures/packing-list-wyc.pdf"));

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

describe("gate packing list WYC PDF", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("remonta tabela bilíngue e classifica organicamente sem bloquear PDF", async () => {
    const texto = await extrairTextoPdf(REAL_PDF);
    expect(texto?.trim().length ?? 0).toBeGreaterThan(100);

    const parsed = parseSupplierOcrText(texto ?? "", "packing-list-wyc.pdf");
    expect(parsed.totalLinhas).toBe(12);
    expect(parsed.linhas.reduce((s, l) => s + (l.qtd ?? 0), 0)).toBe(4387);
    expect(parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0)).toBeCloseTo(9788.85, 2);
    expect(parsed.linhas.some((l) => /^\d+(?:[.,]\d+)?(?:\s+—\s+\d+(?:[.,]\d+)?)?$/.test(l.descOriginal))).toBe(false);

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

    expect(itens).toHaveLength(12);
    expect(itens.every((it) => it.ncm && it.ncm !== "00000000")).toBe(true);
    expect(itens.every((it) => it.ncm.startsWith("9019"))).toBe(true);
    expect(itens.every((it) => it.ncmFonte !== "pendente")).toBe(true);
    expect(() => auditarNcmsParaPdf(itens, state.ncmCatalog)).not.toThrow();
    expect(() =>
      auditarNcmsParaPdf([{ descOriginal: "sem ncm", descPt: "sem ncm", ncm: "", qtd: 1 } as never], state.ncmCatalog),
    ).not.toThrow();
  });
});
