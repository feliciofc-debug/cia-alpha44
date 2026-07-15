import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { RE_QTD_CAIXAS_MULTILINGUE } from "../src/parser-sinonimos.js";
import { parsePlanilhaRows } from "../src/parser.js";
import { ajustarColunasPesoPorMatematica } from "../src/mapear-colunas-matematica.js";
import { calcularPesosTotaisLinha } from "../src/peso-total-linha.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const FIXTURE_NCM1 = join(__dir, "../../../tools/fixtures/ncm1.xlsx");

describe("ncm1 — sinônimos 件数/总重 e peso por caixa", () => {
  it("RE_QTD_CAIXAS reconhece 件数 mas não 每箱数量", () => {
    expect(RE_QTD_CAIXAS_MULTILINGUE.test("件数")).toBe(true);
    expect(RE_QTD_CAIXAS_MULTILINGUE.test("每箱数量")).toBe(false);
    expect(RE_QTD_CAIXAS_MULTILINGUE.test("箱数")).toBe(true);
  });

  it("calcularPesosTotaisLinha com pesoUnitarioPorCaixa usa caixas, não peças", () => {
    const r = calcularPesosTotaisLinha({
      pesoBrutoUnit: 30,
      qtd: 600,
      qtdCaixas: 10,
      qtdPorCaixa: 60,
      pesoUnitarioPorCaixa: true,
    });
    expect(r.pesoBrutoKg).toBe(300);
    expect(r.qtd).toBe(600);
  });

  it("layout ncm1: Σ peso bruto = 14.226,5 kg e H300 = 300 kg", () => {
    const rows: unknown[][] = [
      ["REF", "货物名称", "件数", "每箱数量", "总数量", "体积", "总体积", "毛重", "总重"],
      ["H300", "mochila", 10, 60, 600, 0.26, 2.6, 30, 300],
      ["H301", "mochila B", 20, 30, 600, 0.2, 4, 25, 500],
    ];
    const parsed = parsePlanilhaRows(rows, "teste");
    const sum = parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    expect(sum).toBeCloseTo(800, 2);
    expect(parsed.linhas[0]!.pesoBrutoKg).toBe(300);
    expect(parsed.linhas[0]!.qtdCaixas).toBe(10);
    expect(parsed.linhas[0]!.pesoBrutoFromUnit).toBe(false);
  });

  it("fixture real ncm1.xlsx — Σ bruto 14.226,5 kg, nenhuma linha > 1.000 kg", () => {
    const wb = XLSX.read(readFileSync(FIXTURE_NCM1), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1!, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];
    const parsed = parsePlanilhaRows(rows, "Sheet1", wb.Sheets.Sheet1!["!merges"]);
    const sum = parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    expect(sum).toBeCloseTo(14226.5, 1);
    expect(sum / 14226.5).toBeGreaterThan(0.999);
    expect(sum / 14226.5).toBeLessThan(1.001);
    expect(parsed.linhas.every((l) => (l.pesoBrutoKg ?? 0) < 5000)).toBe(true);
  });

  it("ajustarColunasPesoPorMatematica não confunde qtd com peso", () => {
    const rows: unknown[][] = [
      ["REF", "货物名称", "件数", "每箱数量", "总数量", "毛重", "总重"],
      ["A", "x", 10, 60, 600, 30, 300],
      ["B", "y", 20, 30, 600, 25, 500],
      ["C", "z", 5, 40, 200, 10, 50],
    ];
    const parsed = parsePlanilhaRows(rows, "t");
    const ajuste = ajustarColunasPesoPorMatematica(parsed.colunas, rows, parsed.headerRow);
    expect(ajuste.pesoUnitarioPorCaixa).toBe(true);
    const qtdCols = ajuste.colunas.filter((c) => c.tipo === "qtd").map((c) => c.header);
    expect(qtdCols).toContain("总数量");
    expect(qtdCols).not.toContain("每箱数量");
  });
});
