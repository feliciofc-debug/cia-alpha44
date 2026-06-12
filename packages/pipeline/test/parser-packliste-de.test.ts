import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parsePlanilhaBuffer, parseSupplierFile } from "../src/parser.js";

const fixture = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "packliste-DE-2026-0815.xlsx");

describe("packliste DE 2026-0815", () => {
  it("detecta 14 linhas com cabeçalhos alemães", async () => {
    const buf = readFileSync(fixture);
    const parsed = await parsePlanilhaBuffer(buf);

    expect(parsed.aba).toBe("Packliste");
    expect(parsed.linhas).toHaveLength(14);
    expect(parsed.moedaPlanilha).toBe("EUR");
    expect(parsed.sammelkarton).toBe("999");
    expect(parsed.avisos.some((a) => a.includes("EUR") && a.includes("US$"))).toBe(true);

    const descCol = parsed.colunas.find((c) => c.tipo === "descricao");
    expect(descCol?.header).toMatch(/Warenbezeichnung/i);

    const item1 = parsed.linhas[0]!;
    expect(item1.descricao).toMatch(/DE-WZ-1001/);
    expect(item1.descricao).toMatch(/Akku-Bohrschrauber/);
    expect(item1.qtd).toBe(200); // 40 × 5
    expect(item1.precoUnitario).toBe(38.9);
    expect(item1.pesoLiqKg).toBeCloseTo(290, 0); // 1.45 × 200

    const item11 = parsed.linhas[10]!;
    expect(item11.descricao).toMatch(/Stoßdämpfer|Ersatzteil/i);
    expect(item11.qtd).toBe(1);

    const item12 = parsed.linhas[11]!;
    expect(item12.descricao).toMatch(/VPE 100/i);
    expect(item12.qtd).toBe(100);
    expect(item12.fobTotalUS).toBeCloseTo(1.8, 2); // 0.018 × 100

    const item14 = parsed.linhas[13]!;
    expect(item14.qtd).toBe(1500); // 30 × 50
  });

  it("parseSupplierFile expõe moeda e linhas", async () => {
    const out = await parseSupplierFile(new Uint8Array(readFileSync(fixture)));
    expect(out.totalLinhas).toBe(14);
    expect(out.moedaPlanilha).toBe("EUR");
    expect(out.linhas[11]!.qtd).toBe(100);
  });
});
