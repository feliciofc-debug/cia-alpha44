import { describe, expect, it } from "vitest";
import {
  AVISO_MOEDA_EUR_V1,
  avisoMoedaEurSeAplicavel,
  mesclarAvisoMoedaCotacao,
} from "../src/moeda-cotacao.js";

describe("moeda-cotacao P2c", () => {
  it("EUR vs US$ → aviso v1 exato", () => {
    expect(avisoMoedaEurSeAplicavel("EUR", "US$")).toBe(AVISO_MOEDA_EUR_V1);
  });

  it("US$ vs US$ → sem aviso", () => {
    expect(avisoMoedaEurSeAplicavel("US$", "US$")).toBeNull();
  });

  it("mesclarAvisoMoedaCotacao idempotente", () => {
    const c = mesclarAvisoMoedaCotacao({ moeda: "US$", moedaPlanilha: "EUR", avisosFiscais: [] });
    expect(c.avisosFiscais?.[0]).toBe(AVISO_MOEDA_EUR_V1);
    const c2 = mesclarAvisoMoedaCotacao(c);
    expect(c2.avisosFiscais).toHaveLength(1);
  });
});
