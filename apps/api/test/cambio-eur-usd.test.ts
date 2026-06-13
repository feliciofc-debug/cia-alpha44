import { describe, expect, it, vi } from "vitest";
import { buscarCambioEurUsd } from "../src/services/cambio-eur-usd.js";

vi.mock("../src/services/cambio.js", () => ({
  buscarCambioPtax: vi.fn(async (moeda: string) => {
    if (moeda === "EUR") {
      return {
        moeda: "EUR",
        cotacaoCompra: 5.4,
        cotacaoVenda: 5.5,
        dataCotacao: "2026-06-10 10:00:00.000",
        fonte: "PTAX" as const,
      };
    }
    return {
      moeda: "USD",
      cotacaoCompra: 5.0,
      cotacaoVenda: 5.1,
      dataCotacao: "2026-06-10 10:00:00.000",
      fonte: "PTAX" as const,
    };
  }),
}));

describe("buscarCambioEurUsd", () => {
  it("calcula cross PTAX venda na mesma data", async () => {
    const r = await buscarCambioEurUsd();
    expect(r.fonte).toBe("PTAX-cross");
    expect(r.cambioEurUsd).toBeCloseTo(5.5 / 5.1, 5);
    expect(r.dataCotacao).toBe("2026-06-10");
  });
});
