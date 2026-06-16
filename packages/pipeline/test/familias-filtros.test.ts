import { describe, it, expect } from "vitest";
import { detectarFamilia, detectarFamilias, ncmCoerenteComFamilia } from "../src/index.js";

describe("familias — filtros 8421 vs autopeças 8708", () => {
  it("filtro de óleo automotivo resolve para filtros_separadores (8421)", () => {
    const f = detectarFamilia("Filtro de óleo lubrificante para motores - auto parts");
    expect(f?.id).toBe("filtros_separadores");
    expect(ncmCoerenteComFamilia("84212300", f!)).toBe(true);
  });

  it("autopeça que não é filtro continua autopecas (8708)", () => {
    const f = detectarFamilia("Pastilha de freio auto parts");
    expect(f?.id).toBe("autopecas");
  });

  it("filtros + autopecas no mesmo texto — precedência filtros (sem conflito)", () => {
    const det = detectarFamilias("Filtro de óleo lubrificante para motores - auto parts");
    expect(det.conflito).toBe(false);
    expect(det.familias).toHaveLength(1);
    expect(det.familias[0]!.familia.id).toBe("filtros_separadores");
  });

  it("não vaza: filtro solar / café / amortecedor / pastilha / parafuso", () => {
    expect(detectarFamilia("Filtro solar para piscina")).toBeNull();
    expect(detectarFamilia("Filtro de café expresso")).toBeNull();
    expect(detectarFamilia("Pastilha de freio auto parts")?.id).toBe("autopecas");
    expect(detectarFamilia("Parafuso sextavado M8")?.id).toBe("parafusos_fixadores");
  });
});
