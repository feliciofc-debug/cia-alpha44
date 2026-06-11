import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseBenchmarkPlanilhaBuffer } from "../src/benchmark-planilha.js";

describe("parseBenchmarkPlanilhaBuffer", () => {
  it("extrai NCM, média DI (col 3) e ponderada (col 4)", () => {
    const rows = [
      ["COD SUBITEM NCM", "DESC", "X", "FOB/KG", "FOB PONDER", "CIF/KG", "AMOSTRA"],
      ["94052100", "Lustres", "", 2.11, 4.52, 2.5, 10],
      ["87116000", "Moto eletrica", "", 3.5, 5.1, 4, 5],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const seed = parseBenchmarkPlanilhaBuffer(new Uint8Array(buf), "teste.xlsx");
    expect(seed.total).toBe(2);
    const lustre = seed.itens.find((e) => e.ncm === "94052100");
    expect(lustre?.fobKgMedioDI).toBeCloseTo(2.11, 4);
    expect(lustre?.fobKgPonderado).toBeCloseTo(4.52, 2);
    expect(lustre?.fobKg).toBeCloseTo(2.11, 4);
  });
});
