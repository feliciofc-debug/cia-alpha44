import { describe, it, expect } from "vitest";
import { detectarFamilia, validarNcmItem, criarNcmCatalog, loadNcmVigente } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const AZEITE = "Azeite de oliva extravirgem, em embalagem de vidro de 1 litro";

describe("familias — alimentos vs embalagem_papel", () => {
  it("azeite em vidro → alimentos_bebidas (15) e validarNcmItem ok", () => {
    const f = detectarFamilia(AZEITE);
    expect(f?.id).toBe("alimentos_bebidas");
    expect(validarNcmItem("15092000", AZEITE, catalog, "ia").ok).toBe(true);
  });

  it("caixa de papelão para mudança → embalagem_papel (4819/3923)", () => {
    const desc = "Caixa de papelão para mudança";
    expect(detectarFamilia(desc)?.id).toBe("embalagem_papel");
  });

  it("embalagem de vidro sozinha não vaza para embalagem_papel", () => {
    expect(detectarFamilia("embalagem de vidro 1 litro")).toBeNull();
  });
});
