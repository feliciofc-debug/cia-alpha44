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
const REAL_PDF = readFileSync(join(ROOT, "tools/fixtures/packing-list-wyc-real.pdf"));
const REAL_OCR = readFileSync(join(ROOT, "tools/fixtures/packing-list-wyc-ocr.txt"), "utf8");

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
    expect(texto?.trim().length ?? 0).toBe(0);

    const parsed = parseSupplierOcrText(REAL_OCR, "packing-list-wyc-ocr.txt");
    expect(parsed.totalLinhas).toBe(12);
    expect(parsed.linhas.reduce((s, l) => s + (l.qtd ?? 0), 0)).toBe(4387);
    expect(parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0)).toBeCloseTo(9788.85, 2);
    expect(parsed.linhas.some((l) => /^\d+(?:[.,]\d+)?(?:\s+—\s+\d+(?:[.,]\d+)?)?$/.test(l.descOriginal))).toBe(false);
    expect(parsed.linhas.find((l) => /fascia gun/i.test(l.descOriginal))?.qtd).toBe(400);
    expect(parsed.linhas.find((l) => /fascia gun/i.test(l.descOriginal))?.pesoBrutoKg).toBe(568);
    expect(parsed.linhas.find((l) => /宠物磨甲器|pet polones/i.test(l.descOriginal))?.qtd).toBe(600);
    expect(parsed.linhas.find((l) => /宠物磨甲器|pet polones/i.test(l.descOriginal))?.pesoBrutoKg).toBe(150);
    expect(parsed.linhas.find((l) => /massage shawls/i.test(l.descOriginal))?.qtd).toBe(304);
    expect(parsed.linhas.find((l) => /massage shawls/i.test(l.descOriginal))?.pesoBrutoKg).toBe(275.5);
    const legIn817111052 = parsed.linhas.find((l) => /EZ-7232-M-BR/.test(l.descOriginal));
    expect(legIn817111052?.descOriginal).toMatch(/Leg Massager/i);
    expect(legIn817111052?.qtd).toBe(600);
    expect(legIn817111052?.pesoBrutoKg).toBe(1750);

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
    const massageadores = itens.filter(
      (it) => !/pet polones|宠物磨甲器/i.test(it.descOriginal) && /massage|massager|fascia gun|按摩|足疗|披肩|枪|垫/i.test(it.descOriginal),
    );
    expect(massageadores.length).toBeGreaterThanOrEqual(11);
    expect(massageadores.every((it) => it.ncm.startsWith("9019"))).toBe(true);
    expect(itens.every((it) => it.ncmFonte !== "pendente")).toBe(true);
    expect(() => auditarNcmsParaPdf(itens, state.ncmCatalog)).not.toThrow();
    expect(() =>
      auditarNcmsParaPdf([{ descOriginal: "sem ncm", descPt: "sem ncm", ncm: "", qtd: 1 } as never], state.ncmCatalog),
    ).not.toThrow();
  });
});
