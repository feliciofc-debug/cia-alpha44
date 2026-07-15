import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import {
  inferirMapeamentoColunasPorMatematica,
  mesclarMapeamentoMatematicaPrevalece,
  planilhaProvavelmenteSemCabecalho,
} from "../src/mapear-colunas-matematica.js";
import { parseSupplierFile } from "../src/parser.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const FIXTURE_D003 = join(ROOT, "tools/fixtures/d003.xlsx");

describe("mapear-colunas-matematica — d003 sem cabeçalho", () => {
  it("detecta planilha sem cabeçalho e mapeia preço unitário × qtd = FOB linha", () => {
    const wb = XLSX.read(readFileSync(FIXTURE_D003), { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets.Sheet1!, {
      header: 1,
      raw: true,
      defval: null,
    }) as unknown[][];

    expect(planilhaProvavelmenteSemCabecalho(rows, 0)).toBe(true);

    const mapa = inferirMapeamentoColunasPorMatematica(rows, 0);
    expect(mapa).not.toBeNull();
    expect(mapa!.preco).toBe(7);
    expect(mapa!.fob).toBe(8);
    expect(mapa!.qtd).toBe(5);
    expect(mapa!.qtdCaixas).toBe(3);
    expect(mapa!.qtdPorCaixa).toBe(4);
    expect(mapa!.descricao).toBe(2);
  });

  it("mapa matemático prevalece quando IA confunde preço unitário com FOB", async () => {
    const mapaErrado = async () => ({
      descricao: 2,
      qtd: 5,
      preco: 7,
      fob: 7,
      peso_bruto: 9,
      peso: 11,
    });
    const parsed = await parseSupplierFile(readFileSync(FIXTURE_D003), { mapearColunasIA: mapaErrado });

    expect(parsed.totalLinhas).toBe(13);
    const sumFob = parsed.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    const sumBruto = parsed.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    const sumLiq = parsed.linhas.reduce((s, l) => s + (l.pesoLiqKg ?? 0), 0);
    expect(sumFob).toBeCloseTo(599700, 2);
    expect(sumBruto).toBeCloseTo(19120, 2);
    expect(sumLiq).toBeCloseTo(18220, 2);
    expect(parsed.linhas.every((l) => (l.fobTotalUS ?? 0) > (l.fobUnitarioUS ?? 0))).toBe(true);
  });

  it("mescla: matemática sobrescreve fob errado da IA", () => {
    const math = inferirMapeamentoColunasPorMatematica(
      [
        ["REF", null, "desc", 10, 20, 200, null, 5, 1000, 2, 20, 1.8, 18],
        ["REF2", null, "desc2", 5, 10, 50, null, 4, 200, 3, 15, 2.5, 12.5],
        ["REF3", null, "desc3", 2, 25, 50, null, 10, 500, 4, 8, 3, 6],
      ],
      0,
      true,
    );
    const merged = mesclarMapeamentoMatematicaPrevalece({ fob: 7, preco: 7, qtd: 5 }, math);
    expect(merged?.fob).toBe(8);
    expect(merged?.preco).toBe(7);
  });
});
