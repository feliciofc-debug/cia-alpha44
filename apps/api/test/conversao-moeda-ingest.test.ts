import { describe, expect, it, vi } from "vitest";
import { converterLinhasEurParaUsd } from "../src/services/conversao-moeda-ingest.js";

vi.mock("../src/services/cambio-eur-usd.js", () => ({
  buscarCambioEurUsd: vi.fn(async () => ({
    cambioEurUsd: 1.1,
    dataCotacao: "2026-06-10",
    fonte: "PTAX-cross" as const,
    eurBrl: 5.5,
    usdBrl: 5.0,
  })),
}));

describe("converterLinhasEurParaUsd", () => {
  it("multiplica FOB e anexa taxa quando planilha EUR", async () => {
    const out = await converterLinhasEurParaUsd({
      linhas: [{ fobUnitarioUS: 10, fobTotalUS: 100 }],
      avisos: ["Valores da planilha em EUR tratados como US$ — conversão pendente"],
      moedaPlanilha: "EUR",
    });
    expect(out.cambioEurUsd).toBe(1.1);
    expect(out.linhas[0]!.fobTotalUS).toBeCloseTo(110, 5);
    expect(out.avisos[0]).toContain("convertidos de EUR para US$");
  });

  it("não converte planilha USD", async () => {
    const out = await converterLinhasEurParaUsd({
      linhas: [{ fobUnitarioUS: 10, fobTotalUS: 100 }],
      avisos: [],
      moedaPlanilha: "US$",
    });
    expect(out.cambioEurUsd).toBeUndefined();
    expect(out.linhas[0]!.fobTotalUS).toBe(100);
  });

  it("idempotente quando cambioEurUsd já aplicado", async () => {
    const out = await converterLinhasEurParaUsd({
      linhas: [{ fobUnitarioUS: 11, fobTotalUS: 110 }],
      avisos: [],
      moedaPlanilha: "EUR",
      cambioEurUsd: 1.1,
    });
    expect(out.linhas[0]!.fobTotalUS).toBe(110);
  });
});
