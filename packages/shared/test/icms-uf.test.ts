import { describe, expect, it } from "vitest";
import { icmsSaidaParaDestino, normalizarUf } from "../src/icms-uf.js";

describe("icms-uf", () => {
  it("normaliza sigla UF", () => {
    expect(normalizarUf(" sp ")).toBe("SP");
    expect(normalizarUf("XX")).toBeNull();
  });

  it("benefício AL: 4% só quando destino é AL", () => {
    expect(icmsSaidaParaDestino("AL", "ALAGOAS")).toBe(0.04);
    expect(icmsSaidaParaDestino("SP", "ALAGOAS")).toBe(0.18);
    expect(icmsSaidaParaDestino("RJ", "ALAGOAS")).toBe(0.2);
  });
});
