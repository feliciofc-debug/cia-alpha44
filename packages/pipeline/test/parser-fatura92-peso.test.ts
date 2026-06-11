import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlanilhaRows } from "../src/parser.js";
import { calcularPesosTotaisLinha } from "../src/peso-total-linha.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const fx = JSON.parse(
  fs.readFileSync(path.join(__dir, "fixtures/fatura-92-peso.json"), "utf8"),
) as {
  header: string[];
  rows: unknown[][];
  esperado: {
    pesoLiqTotalKg: number;
    pesoLiqPatineteKg: number;
    fobKgPatinete: number;
    pesoLiqErradoSemMultiplicarKg: number;
  };
};

function matrixFatura92(): unknown[][] {
  return [fx.header, ...fx.rows];
}

describe("calcularPesosTotaisLinha — unitário × caixas × por caixa", () => {
  it("multiplica peso líq/bruto unitário pela quantidade total", () => {
    const r = calcularPesosTotaisLinha({
      pesoLiqUnit: 5.75,
      pesoBrutoUnit: 11.5,
      qtdCaixas: 2,
      qtdPorCaixa: 2,
    });
    expect(r.qtd).toBe(4);
    expect(r.pesoLiqKg).toBeCloseTo(23, 3);
    expect(r.pesoBrutoKg).toBeCloseTo(46, 3);
  });

  it("prefere colunas de total quando informadas", () => {
    const r = calcularPesosTotaisLinha({
      pesoLiqTotal: 16.343,
      pesoBrutoTotal: 18,
      pesoLiqUnit: 5.75,
      qtdCaixas: 2,
      qtdPorCaixa: 2,
    });
    expect(r.pesoLiqKg).toBeCloseTo(16.343, 3);
    expect(r.pesoBrutoKg).toBeCloseTo(18, 3);
  });
});

describe("Parser — fatura 92 limpa (pesos unitários)", () => {
  it("peso líq total ≈ 16,343 kg (não somar unitários sem × caixas × por caixa)", () => {
    const parsed = parsePlanilhaRows(matrixFatura92(), "fatura-92");
    let pesoLiq = 0;
    let pesoLiqErrado = 0;
    for (const l of parsed.linhas) {
      pesoLiq += l.pesoLiqKg ?? 0;
      const raw = l.raw as Record<string, unknown>;
      pesoLiqErrado += Number(raw["Peso Líq Unit (kg)"] ?? 0);
    }
    expect(pesoLiq).toBeCloseTo(fx.esperado.pesoLiqTotalKg, 2);
    expect(pesoLiqErrado).toBeCloseTo(fx.esperado.pesoLiqErradoSemMultiplicarKg, 2);
    expect(pesoLiq).toBeGreaterThan(pesoLiqErrado);
  });

  it("patinete: peso líq = unit × caixas × por caixa (15,343 kg); FOB/kg ≈ 7,10", () => {
    const parsed = parsePlanilhaRows(matrixFatura92(), "fatura-92");
    const patinete = parsed.linhas.find((l) => /patinete/i.test(l.descricao));
    expect(patinete).toBeDefined();
    expect(patinete!.pesoLiqKg).toBeCloseTo(fx.esperado.pesoLiqPatineteKg, 2);
    expect(patinete!.qtd).toBe(2);
    const fobKg = (patinete!.fobTotalUS ?? 0) / (patinete!.pesoLiqKg ?? 1);
    expect(fobKg).toBeCloseTo(fx.esperado.fobKgPatinete, 2);
  });

  it("FOB/kg patinete gabarito 4,74 US$/kg líq com 4 un × 5,75 kg (109/23)", () => {
    const r = calcularPesosTotaisLinha({
      pesoLiqUnit: 5.75,
      qtdCaixas: 2,
      qtdPorCaixa: 2,
    });
    expect(r.pesoLiqKg).toBeCloseTo(23, 3);
    expect(109 / r.pesoLiqKg!).toBeCloseTo(4.739, 2);
  });
});
