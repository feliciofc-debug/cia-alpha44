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
const FIXTURE = JSON.parse(
  readFileSync(join(ROOT, "tools/fixtures/fatura-92-layout-china.json"), "utf8"),
) as { sheet: string; header: string[]; rows: unknown[][] };

describe("gate fatura 92 — layout China embarque 92", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("parse + montagem preserva NCM da coluna como planilha-cliente", async () => {
    const parsed = parsePlanilhaRows([FIXTURE.header, ...FIXTURE.rows], FIXTURE.sheet);
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

    const { itens } = await montarItens(
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
        material: l.material ?? null,
        uso: l.uso ?? null,
      })),
      state,
    );

    expect(itens).toHaveLength(13);
    expect(itens[0]!.qtd).toBe(500);
    expect(itens[1]!.qtd).toBe(210);
    expect(itens[0]!.pesoBrutoKg).toBe(11500);
    expect(itens[1]!.pesoBrutoKg).toBe(4830);
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
});
