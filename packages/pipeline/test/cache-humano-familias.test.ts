import { describe, it, expect } from "vitest";
import {
  criarNcmCatalog,
  detectarFamilias,
  loadNcmVigente,
  validarNcmParaCacheHumano,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("moto × alumínio — guard-rail descOriginal", () => {
  const orig = "1-20 — MOT-EL-3000 — 电动摩托车 3000W 锂电池";

  it("descOriginal sozinha → moto_eletrica sem conflito (descPt com alumínio ignorada)", () => {
    const det = detectarFamilias({ descOriginal: orig, uso: "骑行" });
    expect(det.conflito).toBe(false);
    expect(det.familias.map((f) => f.familia.id)).toEqual(["moto_eletrica"]);
  });

  it("descrição com moto + alumínio → precedência moto (sem conflito)", () => {
    const det = detectarFamilias({
      descOriginal: "Motocicleta elétrica 3000W estrutura em liga de alumínio",
    });
    expect(det.conflito).toBe(false);
    expect(det.familias.map((f) => f.familia.id)).toEqual(["moto_eletrica"]);
  });
});

describe("validarNcmParaCacheHumano", () => {
  const moto = {
    descOriginal: "1-20 — MOT-EL-3000 — 电动摩托车 3000W 锂电池",
    material: "钢/铝合金",
    uso: "骑行",
  };

  it("recusa moto → 9617 (garrafa)", () => {
    const v = validarNcmParaCacheHumano(catalog, moto, "96170010");
    expect(v.ok).toBe(false);
    expect(v.motivo).toMatch(/incoerente/i);
  });

  it("aceita moto → 87116000", () => {
    const v = validarNcmParaCacheHumano(catalog, moto, "87116000");
    expect(v.ok).toBe(true);
  });

  it("aceita garrafa → 9617", () => {
    const v = validarNcmParaCacheHumano(catalog, {
      descOriginal: "Garrafa térmica inox 500ml vacuum flask",
      uso: "",
    }, "96170010");
    expect(v.ok).toBe(true);
  });
});
