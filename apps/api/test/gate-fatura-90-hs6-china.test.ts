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
import { montarItens } from "../src/services/cotacao.js";
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
const REAL_XLS = readFileSync(join(ROOT, "tools/fixtures/0526健腹轮电动洗澡按摩刷手机膜箱单.xls"));

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

describe("gate fatura 90 — âncora HS6 de código chinês", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("parse + montagem resolvem NCM pelo HS6 da coluna chinesa", async () => {
    const parsed = await parseSupplierFile(REAL_XLS);
    expect(parsed.abaUsada).toBe("巴西发票模板-每箱");
    expect(parsed.totalLinhas).toBe(3);
    expect(parsed.metaNcmEmbarque?.linhasComNcmColuna).toBe(3);

    expect(parsed.linhas.map((l) => l.ncm)).toEqual(["9603290090", "9506919000", "7020009990"]);
    expect(parsed.linhas.map((l) => l.qtd)).toEqual([3960, 500, 375]);
    expect(parsed.linhas[0]!.pesoBrutoKg).toBeCloseTo(3960, 3);
    expect(parsed.linhas[1]!.pesoBrutoKg).toBeCloseTo(4200, 3);
    expect(parsed.linhas[2]!.pesoBrutoKg).toBeCloseTo(38.572, 3);

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
  });
});
