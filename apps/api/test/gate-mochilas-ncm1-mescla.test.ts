/**
 * Gate mochilas (ncm1.xlsx) — mesclas verticais na descrição + linha de totais sem rótulo.
 *
 * Causa do 422 em produção: linhas filhas de mescla vinham só com REF (H321…)
 * sem texto de produto → classificação cega / validação falha no fluxo upload→classificar.
 * Correção: herança de célula-âncora em colunas de texto + filtro matemático por coluna.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  detectarFamilia,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  parseSupplierFile,
} from "@cia/pipeline";
import { ingerirArquivo } from "../src/services/ingest.js";
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
const FIXTURE_NCM1 = readFileSync(join(ROOT, "tools/fixtures/ncm1.xlsx"));

const providerMochila: LlmProvider = {
  nome: "mock-mochila-4202",
  disponivel: true,
  classify: async (itens: ClassifyItemInput[]) =>
    itens.map((i) => ({
      descPt: `Mochila — ${i.descOriginal.slice(0, 40)}`,
      descDuimp: "Mochila escolar",
      ncmCandidatos: [{ ncm: "42029200", confianca: 0.92, justificativa: "gate mochilas" }],
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

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

describe("gate mochilas ncm1 — mescla vertical + total sem rótulo", () => {
  it("parse completa sem 422, herda descrições, descarta total e vincula fotos", async () => {
    const ocr = { disponivel: false, extrair: async () => ({ texto: "", paginas: 0, avisos: [] }) };
    const ingested = await ingerirArquivo("ncm1.xlsx", FIXTURE_NCM1, ocr);
    expect(ingested.totalLinhas).toBe(34);
    expect(ingested.linhasTotaisDescartadas).toBe(1);

    const soRef = ingested.linhas.filter((l) => /^H\d{3}(?:\s*—)?$/.test(l.descOriginal.trim()));
    expect(soRef).toHaveLength(0);

    const semTextoProduto = ingested.linhas.filter(
      (l) => !/背包|mochila|backpack|bag/i.test(l.descOriginal),
    );
    expect(semTextoProduto).toHaveLength(0);

    expect(ingested.imagensMapeadas).toBe(34);
    expect(ingested.imagensArquivo).toBeGreaterThanOrEqual(34);
    expect(ingested.linhas.every((l) => l.fotoBase64)).toBe(true);

    const wb = XLSX.read(FIXTURE_NCM1, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1!, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    const sumCaixas = ingested.linhas.reduce((s, l) => s + (num(rows[l.__row! - 1]?.[3]) ?? 0), 0);
    const sumPesoTotal = ingested.linhas.reduce((s, l) => s + (num(rows[l.__row! - 1]?.[9]) ?? 0), 0);
    expect(sumCaixas).toBeCloseTo(330, 2);
    expect(sumPesoTotal).toBeCloseTo(14226.5, 2);

    for (const l of ingested.linhas) {
      const fam = detectarFamilia({ descOriginal: l.descOriginal });
      expect(fam?.id).toBe("malas_bolsas");
    }
  }, 90000);

  it("classificação orgânica preenche NCM família 4202 após descrições herdadas", async () => {
    const parsed = await parseSupplierFile(FIXTURE_NCM1);
    const state = stateTeste(providerMochila);
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });

    expect(itens).toHaveLength(34);
    expect(itens.every((it) => it.ncm.startsWith("4202"))).toBe(true);
    expect(itens[0]!.ncm).toBe("42029200");
  }, 90000);
});
