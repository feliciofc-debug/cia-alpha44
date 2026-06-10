import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseBenchmarkPlanilhaBuffer } from "../src/benchmark-planilha.js";

describe("parseBenchmarkPlanilhaBuffer", () => {
  it("extrai NCM e FOB/kg de planilha estilo Comex Plus", () => {
    const rows = [
      ["COD SUBITEM NCM", "DESC", "X", "FOB/KG", "CIF/KG", "AMOSTRA"],
      ["94052100", "Lustres", "", 2.11, 2.5, 10],
      ["87116000", "Moto eletrica", "", 3.5, 4, 5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const seed = parseBenchmarkPlanilhaBuffer(new Uint8Array(buf), "teste.xlsx");
    expect(seed.total).toBe(2);
    expect(seed.itens.find((e) => e.ncm === "94052100")?.fobKg).toBeCloseTo(2.11, 4);
  });
});
