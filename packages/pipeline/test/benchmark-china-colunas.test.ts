import { describe, it, expect } from "vitest";
import { parseBenchmarkPlanilhaBuffer } from "../src/benchmark-planilha.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("IMPORTAÇÕES DA CHINA — colunas FOB/kg", () => {
  it("usa PREÇO FOB/KG (média DI), não PRECO DOLAR/Kg IMP (ponderada ~3× maior)", () => {
    const desktop = join(
      process.env.USERPROFILE || "",
      "Desktop",
      "IMPORTAÇÕES DA CHINA NOVO.xlsx",
    );
    let buf: Buffer;
    try {
      buf = readFileSync(desktop);
    } catch {
      return; // skip CI sem arquivo local
    }
    const seed = parseBenchmarkPlanilhaBuffer(buf, "IMPORTAÇÕES DA CHINA NOVO.xlsx");
    const lustre = seed.itens.find((e) => e.ncm === "94051190");
    expect(lustre).toBeDefined();
    expect(lustre!.fobKgMedioDI).toBeCloseTo(1.907, 2);
    expect(lustre!.fobKgPonderado).toBeCloseTo(4.516, 2);
    const ratio = lustre!.fobKgPonderado! / lustre!.fobKgMedioDI;
    expect(ratio).toBeGreaterThan(2);
    expect(ratio).toBeLessThan(3.5);
  });
});
