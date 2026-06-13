import { describe, expect, it } from "vitest";
import {
  AVISO_MOEDA_EUR_V1,
  avisoMoedaCotacao,
  avisoMoedaEurConvertida,
  mesclarAvisoMoedaCotacao,
} from "../src/moeda-cotacao.js";

describe("moeda-cotacao P2c", () => {
  it("EUR vs US$ sem taxa → aviso v1 exato", () => {
    expect(avisoMoedaCotacao({ moedaPlanilha: "EUR", moeda: "US$" })).toBe(AVISO_MOEDA_EUR_V1);
  });

  it("EUR vs US$ com cambioEurUsd → aviso v1.1", () => {
    const aviso = avisoMoedaCotacao({
      moedaPlanilha: "EUR",
      moeda: "US$",
      cambioEurUsd: 1.0876,
      cambioEurUsdData: "2026-06-10",
    });
    expect(aviso).toBe(avisoMoedaEurConvertida(1.0876, "2026-06-10"));
    expect(aviso).toContain("convertidos de EUR para US$");
  });

  it("US$ vs US$ → sem aviso", () => {
    expect(avisoMoedaCotacao({ moedaPlanilha: "US$", moeda: "US$" })).toBeNull();
  });

  it("mesclarAvisoMoedaCotacao idempotente com v1.1", () => {
    const c = mesclarAvisoMoedaCotacao({
      moeda: "US$",
      moedaPlanilha: "EUR",
      cambioEurUsd: 1.08,
      cambioEurUsdData: "2026-06-10",
      avisosFiscais: [],
    });
    expect(c.avisosFiscais?.[0]).toContain("convertidos de EUR para US$");
    const c2 = mesclarAvisoMoedaCotacao(c);
    expect(c2.avisosFiscais).toHaveLength(1);
  });
});
