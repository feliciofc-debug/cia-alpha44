import { describe, it, expect } from "vitest";
import {
  analisarEscalaFob,
  bloquearPersistenciaFobCorrupto,
  ncmSuspeitoLixo,
  PESO_MAX_LINHA_KG,
  RATIO_CORRUPCAO_GROSS,
} from "../src/fob-escala.js";

describe("fob-escala guard", () => {
  it("detecta NCM lixo 00015423", () => {
    expect(ncmSuspeitoLixo("00015423")).toBe(true);
    expect(ncmSuspeitoLixo("87116000")).toBe(false);
  });

  it("detecta peso absurdo acima de 50t", () => {
    const a = analisarEscalaFob({
      ncm: "87116000",
      pesoLiqKg: 171_894,
      fobTotalUS: 74_936,
      fobKgPlanilha: 2.28,
    });
    expect(a.flags).toContain("peso_absurdo");
    expect(a.pesoRateio).toBeGreaterThan(PESO_MAX_LINHA_KG);
    expect(bloquearPersistenciaFobCorrupto(a)).toBe(true);
  });

  it("ratio ~2x invoice vs planilha NÃO bloqueia persistência", () => {
    const a = analisarEscalaFob({
      ncm: "87116000",
      pesoLiqKg: 1000,
      fobTotalUS: 4740,
      fobKgPlanilha: 2.28,
    });
    expect(a.ratio).toBeCloseTo(4740 / 2280, 1);
    expect(a.flags).not.toContain("ratio_corrupcao");
    expect(bloquearPersistenciaFobCorrupto(a)).toBe(false);
  });

  it("ratio corrupção grosseira (>1000×) flagga sem julgar valoração normal", () => {
    const a = analisarEscalaFob({
      ncm: "94051190",
      pesoLiqKg: 100,
      fobTotalUS: 3_000_000,
      fobKgPlanilha: 1.9072,
    });
    expect(a.ratio!).toBeGreaterThan(RATIO_CORRUPCAO_GROSS);
    expect(a.flags).toContain("ratio_corrupcao");
  });
});
