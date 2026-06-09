import { describe, it, expect } from "vitest";
import {
  criarNcmCatalog,
  detectarFamilia,
  loadNcmVigente,
  ncmCoerenteComFamilia,
  resolveNcm,
  validarNcmItem,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("classificar-ncm — família iluminação", () => {
  it("detecta lustre e rejeita NCM fora do cap. 9405", () => {
    const fam = detectarFamilia("B2-1 — LUSTRE — MODELO pendente teto");
    expect(fam?.capitulo).toBe("9405");
    expect(ncmCoerenteComFamilia("94052100", fam)).toBe(true);
    expect(ncmCoerenteComFamilia("21069010", fam)).toBe(false);
    expect(ncmCoerenteComFamilia("84803000", fam)).toBe(false);
  });

  it("substitui 94051093 inválido por NCM 9405 vigente (não cap. 21/84)", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "94051093",
      descricao: "Lustre de teto B2-1 chandelier LED",
      candidatosIa: [
        { ncm: "21069010", confianca: 0.95 },
        { ncm: "84803000", confianca: 0.9 },
      ],
    });
    expect(r.valido).toBe(true);
    expect(r.ncm.startsWith("9405")).toBe(true);
    expect(r.ncm).not.toBe("21069010");
    expect(r.ncmPlanilhaOriginal).toBe("94051093");
  });

  it("validação pós-resolução marca incoerência", () => {
    const v = validarNcmItem("21069010", "Lustre pendente", catalog, "ia");
    expect(v.ok).toBe(false);
    expect(v.avisos[0]).toMatch(/incoerente/i);
  });
});
