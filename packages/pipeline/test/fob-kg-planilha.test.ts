import { describe, it, expect } from "vitest";
import {
  distanciaNcm,
  fobKgNcmMaisProximo,
  indiceFobKgPlanilha,
  preencherFobKgPlanilha,
} from "../src/fob-kg-planilha.js";

describe("fob-kg-planilha", () => {
  it("calcula distância NCM por prefixo", () => {
    expect(distanciaNcm("94052100", "94052100")).toBe(0);
    expect(distanciaNcm("94052100", "94051190")).toBe(4);
    expect(distanciaNcm("94052100", "85044010")).toBe(9);
  });

  it("encontra NCM mais próximo no índice da planilha", () => {
    const idx = indiceFobKgPlanilha([
      {
        descOriginal: "Lustre A",
        ncm: "94052100",
        qtd: 1,
        pesoBrutoKg: 100,
        pesoLiqKg: 100,
        fobUnitarioUS: null,
        fobTotalUS: 211,
      },
    ]);
    const ref = fobKgNcmMaisProximo("94051190", idx);
    expect(ref?.ncm).toBe("94052100");
    expect(ref?.fobKg).toBeCloseTo(2.11, 2);
  });

  it("preenche FOB ausente com FOB/kg do NCM mais próximo", () => {
    const { linhas } = preencherFobKgPlanilha([
      {
        descOriginal: "Lustre referência",
        ncm: "94052100",
        qtd: 1,
        pesoBrutoKg: 100,
        pesoLiqKg: 100,
        fobUnitarioUS: null,
        fobTotalUS: 211,
      },
      {
        descOriginal: "Lustre sem FOB",
        ncm: "94051190",
        qtd: 1,
        pesoBrutoKg: 50,
        pesoLiqKg: 50,
        fobUnitarioUS: null,
        fobTotalUS: null,
      },
    ]);
    expect(linhas[1]?.fobTotalUS).toBeCloseTo(105.5, 0);
  });
});
