/**
 * Gate mochilas (ncm1.xlsx) — mesclas verticais, peso 总重, FOB planilha China 4202.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import type { Cotacao } from "@cia/shared";
import {
  buildBenchmarkIndex,
  criarNcmCatalog,
  criarTecSource,
  detectarFamilia,
  fobKgParaPreenchimento,
  loadComexSeed,
  loadNcmVigenteCache,
  loadTecCache,
  parseSupplierFile,
} from "@cia/pipeline";
import { ingerirArquivo } from "../src/services/ingest.js";
import { calcularCotacao, montarItens } from "../src/services/cotacao.js";
import { fobUsadoNoEngine, pesoFobPlanilhaItem } from "../src/services/fob-kg-manual.js";
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

function cotacaoTeste(itens: Cotacao["itens"]): Cotacao {
  return {
    cliente: "gate mochilas ncm1",
    benefFiscal: "NENHUM",
    moeda: "USD",
    cambio: 5.5,
    freteTotalUS: 1200,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 400,
    antidumpingBRL: 0,
    origem: "CN",
    destino: "SP",
    incoterm: "FOB",
    despesas: [],
    outrasDespesasBaseBRL: 0,
    params: { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04, ipiAliqSaida: 0 },
    itens,
  };
}

describe("gate mochilas ncm1 — mescla vertical + peso + FOB", () => {
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

    const sumBruto = ingested.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    expect(sumBruto).toBeCloseTo(14226.5, 1);
    expect(sumBruto / 14226.5).toBeGreaterThan(0.999);
    expect(sumBruto / 14226.5).toBeLessThan(1.001);
    expect(ingested.linhas.every((l) => (l.pesoBrutoKg ?? 0) < 5000)).toBe(true);
    expect(Math.max(...ingested.linhas.map((l) => l.pesoBrutoKg ?? 0))).toBeLessThan(1100);
  }, 90000);

  it("FOB DI > 0 com fonte válida em todos os itens; DIF IPI ≠ −IPI entrada", async () => {
    const parsed = await parseSupplierFile(FIXTURE_NCM1);
    const state = stateTeste(providerMochila);
    const { itens } = await montarItens(parsed.linhas, state, { gravarCacheClassificacao: false });

    expect(itens).toHaveLength(34);

    const { resultado, itens: itensCalc } = calcularCotacao(cotacaoTeste(itens), state);
    expect(resultado.entrada.fobTotalUS).toBeGreaterThan(0);

    let sumMotor = 0;
    for (const it of itensCalc) {
      expect(it.fobPendente).not.toBe(true);
      expect(it.fobKgFonte).toBeTruthy();
      expect(it.fobKgFonte).not.toBe("pendente");

      const fobMotor = fobUsadoNoEngine(it, it.calibracao!);
      sumMotor += fobMotor;
      expect(fobMotor).toBeGreaterThan(0);

      const bruto = pesoFobPlanilhaItem(it, it.benchmark);
      const fobKg = fobKgParaPreenchimento(it.benchmark);
      if (fobKg != null && bruto > 0) {
        expect(fobMotor).toBeCloseTo(fobKg * bruto, 0);
      }
    }
    expect(resultado.entrada.fobTotalUS).toBeCloseTo(sumMotor, 0);

    const ipiEntrada = resultado.entrada.ipiTotal ?? 0;
    expect(resultado.saida.difIPI).not.toBeCloseTo(-ipiEntrada, 0);
    if (ipiEntrada > 0) {
      expect(resultado.saida.difIPI).toBeGreaterThan(-ipiEntrada);
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
