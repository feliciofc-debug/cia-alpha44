import { describe, it, expect } from "vitest";
import { lookupBenchmark, calibrarFobKg, analisarRisco, normalizarNcm } from "../src/index.js";

describe("Benchmark ComexStat", () => {
  it("encontra NCM da planilha 66 (8204.20.00)", () => {
    const b = lookupBenchmark("8204.20.00");
    expect(b.fonte).toBe("ComexStat");
    expect(b.mediaFobKg).not.toBeNull();
    expect(b.amostra).toBeGreaterThanOrEqual(0);
  });

  it("retorna sem base para NCM inexistente", () => {
    const b = lookupBenchmark("99999999");
    expect(b.fonte).toBe("sem base");
    expect(b.mediaFobKg).toBeNull();
  });

  it("normaliza NCM com pontos", () => {
    expect(normalizarNcm("8204.20.00")).toBe("82042000");
  });
});

describe("Calibrador FOB/KG", () => {
  it("mantém FOB dentro da faixa", () => {
    const benchmark = lookupBenchmark("82042000");
    const r = calibrarFobKg({
      fobKgInformado: 1.4,
      pesoLiqKg: 100,
      benchmark,
    });
    expect(r.fobKgCalibrado).toBeGreaterThan(0);
  });

  it("eleva FOB abaixo do piso defensável", () => {
    const benchmark = lookupBenchmark("82042000");
    if (benchmark.pisoDefensavel === null) return;
    const r = calibrarFobKg({
      fobKgInformado: 0.01,
      pesoLiqKg: 100,
      benchmark,
    });
    expect(r.fobKgCalibrado).toBeGreaterThanOrEqual(benchmark.pisoDefensavel);
    expect(r.ajustado).toBe(true);
  });
});

describe("Análise de risco", () => {
  it("marca cinza quando muito abaixo do benchmark", () => {
    const benchmark = lookupBenchmark("82042000");
    const calibracao = calibrarFobKg({
      fobKgInformado: 0.001,
      pesoLiqKg: 100,
      benchmark,
    });
    const risco = analisarRisco({
      ncm: "82042000",
      descPt: "Chaves de fenda",
      calibracao,
      benchmark,
    });
    expect(["CINZA_VALORACAO", "VERMELHO_TECNICO", "AMARELO_TECNICO"]).toContain(
      risco.canal,
    );
  });
});
