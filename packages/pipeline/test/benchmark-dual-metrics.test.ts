import { describe, it, expect, beforeEach } from "vitest";
import {
  buildBenchmarkIndex,
  lookupBenchmark,
  substituirHistoricoBenchmark,
  calibrarFobKg,
  analisarRisco,
  AVISO_BENCHMARK_SO_PONDERADA,
} from "../src/index.js";

const NCM_LUSTRE = "94051190";
const MEDIO_DI = 1.90724668715675;
const PONDERADO_PLANILHA = 4.5163;
const PONDERADO_API = 4.49948066;

describe("benchmark dual — 94051190", () => {
  beforeEach(() => {
    substituirHistoricoBenchmark([]);
  });

  it("planilha traz média DI (col 3) e ponderada (col 4) com rastro por período real", () => {
    substituirHistoricoBenchmark([
      {
        ncm: NCM_LUSTRE,
        fobKgMedioDI: MEDIO_DI,
        fobKgPonderado: PONDERADO_PLANILHA,
        fobKg: MEDIO_DI,
        amostra: 12,
      },
    ]);
    const index = buildBenchmarkIndex([], "ref", { planilhaPeriodo: "2023-S1" });
    const b = lookupBenchmark(index, NCM_LUSTRE);

    expect(b.fobKgMedioDI).toBeCloseTo(MEDIO_DI, 4);
    expect(b.fobKgPonderado).toBeCloseTo(PONDERADO_PLANILHA, 2);
    expect(b.mediaFobKg).toBeCloseTo(MEDIO_DI, 4);
    expect(b.amostraDIs).toBe(12);
    expect(b.rastroFonte).toBe("planilha-mensal(2023-S1):media-DI");
    expect(b.pisoDefensavel).toBeGreaterThan(0);
    expect(b.pisoDefensavel!).toBeLessThan(MEDIO_DI);
  });

  it("calibrador e risco usam média DI — não a ponderada (~4,5)", () => {
    substituirHistoricoBenchmark([
      {
        ncm: NCM_LUSTRE,
        fobKgMedioDI: MEDIO_DI,
        fobKgPonderado: PONDERADO_PLANILHA,
        fobKg: MEDIO_DI,
        amostra: 12,
      },
    ]);
    const index = buildBenchmarkIndex([], "ref", { planilhaPeriodo: "2023-S1" });
    const benchmark = lookupBenchmark(index, NCM_LUSTRE);
    const fobInformado = 1.85;

    const cal = calibrarFobKg({ fobKgInformado: fobInformado, pesoLiqKg: 100, benchmark });
    const desvioEsperado = ((fobInformado - MEDIO_DI) / MEDIO_DI) * 100;
    expect(cal.desvioBenchmarkPct).toBeCloseTo(desvioEsperado, 1);
    expect(Math.abs((cal.desvioBenchmarkPct ?? 0) - ((fobInformado - PONDERADO_PLANILHA) / PONDERADO_PLANILHA) * 100)).toBeGreaterThan(50);

    const risco = analisarRisco({
      ncm: NCM_LUSTRE,
      calibracao: cal,
      benchmark,
    });
    expect(risco.flags.some((f) => f.includes("faixa defensável") || f.includes("média DI"))).toBe(true);
    expect(risco.flags.some((f) => f.includes("referência fraca"))).toBe(false);
  });

  it("ComexStat puro: ponderada sem piso, com aviso", () => {
    const index = buildBenchmarkIndex(
      [{ ncm: NCM_LUSTRE, desc: "Lustre", fobKg: PONDERADO_API, cifKg: 5, amostra: 1 }],
      "1º semestre 2023 · China",
      { comexstatPeriodo: "2023-S1" },
    );
    const b = lookupBenchmark(index, NCM_LUSTRE);

    expect(b.fonte).toBe("ComexStat");
    expect(b.fobKgMedioDI).toBeNull();
    expect(b.fobKgPonderado).toBeCloseTo(PONDERADO_API, 4);
    expect(b.mediaFobKg).toBeNull();
    expect(b.pisoDefensavel).toBeNull();
    expect(b.rastroFonte).toBe("comexstat(2023-S1):ponderada");
    expect(b.avisoBenchmark).toBe(AVISO_BENCHMARK_SO_PONDERADA);

    const cal = calibrarFobKg({ fobKgInformado: 1.9, pesoLiqKg: 50, benchmark: b });
    expect(cal.desvioBenchmarkPct).toBeNull();
    expect(cal.ajustado).toBe(false);
    expect(cal.justificativa).toContain("referência fraca");

    const risco = analisarRisco({ ncm: NCM_LUSTRE, calibracao: cal, benchmark: b });
    expect(risco.flags.some((f) => f.includes("referência fraca"))).toBe(true);
  });
});
