/**
 * Gate fatura 92 — NCM declarado na planilha do cliente → planilha-cliente / planilha-cliente-familia.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildBenchmarkIndex,
  loadComexSeed,
  criarNcmCatalog,
  loadNcmVigenteCache,
  criarTecSource,
  loadTecCache,
  type LinhaCrua,
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
const FIXTURE = JSON.parse(
  readFileSync(join(__dir, "../../../tools/fixtures/fatura-92-planilha-cliente-linhas.json"), "utf8"),
) as { linhas: LinhaCrua[] };

describe("gate fatura 92 — planilha cliente NCM", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("linhas com NCM na planilha → ncmFonte planilha-cliente ou planilha-cliente-familia", async () => {
    const comex = loadComexSeed();
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

    const state = {
      benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
      ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
      tecSource: criarTecSource(loadTecCache()),
      siscomex: { lookup: () => null },
      ocr: null,
      provider,
    } as unknown as AppState;

    const { itens } = await montarItens(FIXTURE.linhas, state);

    const comNcmPlanilha = FIXTURE.linhas.filter((l) => l.ncm?.trim());
    expect(comNcmPlanilha.length).toBeGreaterThan(0);

    for (let i = 0; i < FIXTURE.linhas.length; i++) {
      const linha = FIXTURE.linhas[i]!;
      const item = itens[i]!;
      if (!linha.ncm?.trim()) continue;
      expect(["planilha-cliente", "planilha-cliente-familia"]).toContain(item.ncmFonte);
      expect(item.ncmFonte).not.toBe("planilha-china");
    }
  });
});
