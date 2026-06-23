/**
 * Gate cotação 72 — Descrição PT sem caractere chinês (21 itens contêiner 72).
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
  temCaractereCjk,
} from "@cia/pipeline";
import { montarItens } from "../src/services/cotacao.js";
import type { AppState } from "../src/state.js";
import type { LinhaCrua } from "@cia/pipeline";

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
  readFileSync(join(__dir, "../../../tools/fixtures/cotacao-72-gabarito.json"), "utf8"),
) as {
  itens: Array<{
    descOriginal: string;
    ncm: string;
    qtd: number;
    pesoLiqKg: number;
    pesoBrutoKg: number;
    fobTotalUS: number;
  }>;
};

function buildState(): AppState {
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    tecSource: { buscar: () => null, buscarAsync: async () => null },
    siscomex: { lookup: () => null },
    ocr: null,
    provider: { nome: "mock", disponivel: false, classify: async () => [] },
  } as unknown as AppState;
}

describe("gate cotação 72 — tradução Descrição PT", () => {
  beforeEach(() => {
    process.env.CLASSIFICACAO_NCM_PROVIDER = "off";
  });

  it("21 itens — descPt sem caractere chinês e com prefixo do modelo", async () => {
    const linhas: LinhaCrua[] = FIXTURE.itens.map((row) => ({
      descOriginal: row.descOriginal,
      ncm: row.ncm,
      qtd: row.qtd,
      pesoLiqKg: row.pesoLiqKg,
      pesoBrutoKg: row.pesoBrutoKg,
      fobTotalUS: row.fobTotalUS,
      fobUnitarioUS: null,
    }));

    const { itens } = await montarItens(linhas, buildState());
    expect(itens.length).toBe(21);

    const comCjk: string[] = [];
    for (const it of itens) {
      const pt = it.descPt ?? "";
      if (temCaractereCjk(pt)) {
        comCjk.push(`${it.descOriginal.slice(0, 40)} → ${pt.slice(0, 60)}`);
      }
      expect(pt).toMatch(/^[A-Z0-9-]+ — /);
      expect(pt).not.toMatch(/挂钩|电动|智能/);
    }

    expect(comCjk, `Itens com CJK em descPt:\n${comCjk.join("\n")}`).toHaveLength(0);
  });
});
