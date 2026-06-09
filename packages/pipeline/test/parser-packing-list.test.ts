import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseSupplierFile } from "../src/parser.js";

describe("Parser — planilha 装箱单 (lustres China)", () => {
  it("usa totais (qtd, peso, FOB) e não valores por caixa", async () => {
    const desktop = path.join(os.homedir(), "Desktop");
    const nome = fs.readdirSync(desktop).find(
      (f) => f.endsWith(".xlsx") && f.startsWith("16 -") && !f.includes("PLANILHA") && !f.includes("(1)"),
    );
    if (!nome) return;

    const parsed = await parseSupplierFile(new Uint8Array(fs.readFileSync(path.join(desktop, nome))));
    expect(parsed.totalLinhas).toBe(27);

    let pesoLiq = 0;
    let pesoBruto = 0;
    let fob = 0;
    for (const l of parsed.linhas) {
      pesoLiq += l.pesoLiqKg ?? 0;
      pesoBruto += l.pesoBrutoKg ?? 0;
      fob += l.fobTotalUS ?? 0;
    }

    expect(pesoLiq).toBeGreaterThan(5000);
    expect(pesoBruto).toBeGreaterThan(6000);
    expect(fob).toBeGreaterThan(13000);
    expect(parsed.linhas[0]?.descOriginal).toMatch(/B2-1|LUSTRE/i);
    expect(parsed.linhas[0]?.qtd).toBe(200);
    expect(parsed.linhas[0]?.pesoLiqKg).toBe(356);
    expect(parsed.linhas[0]?.fobTotalUS).toBeCloseTo(780.55, 0);
  });
});
