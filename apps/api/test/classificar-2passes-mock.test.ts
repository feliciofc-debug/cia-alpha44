import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import { criarMockProvider } from "../src/llm/mock.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);

describe("mock classify2Passes — determinístico CI", () => {
  it("garrafa térmica inox → 9617 / 96170010 (não 7323)", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Garrafa térmica inox 500ml isolamento vácuo" },
    ]);
    expect(r!.posicaoPasse1).toBe("9617");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("96170010");
    expect(r!.ncmCandidatos[0]!.ncm.startsWith("7323")).toBe(false);
    expect(catalog.existe(r!.ncmCandidatos[0]!.ncm)).toBe(true);
  });

  it("fone bluetooth TWS → 8518 / 85183000", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Fone bluetooth TWS wireless earphone" },
    ]);
    expect(r!.posicaoPasse1).toBe("8518");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("85183000");
  });

  it("cadeira escritório giratória → 9401 / 94013100", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Cadeira escritório giratória altura ajustável" },
    ]);
    expect(r!.posicaoPasse1).toBe("9401");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("94013100");
  });
});
