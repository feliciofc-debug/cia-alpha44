import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("resolveNcm — planilha × IA × Siscomex", () => {
  it("mantém NCM da planilha mesmo quando IA sugere outro (ex.: lustres)", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "94051093",
      candidatosIa: [{ ncm: "94054090", confianca: 0.9, descricaoOficial: "Inválido IA" }],
    });
    expect(r.ncm).toBe("94051093");
    expect(r.fonte).toBe("planilha");
    expect(r.avisos.some((a) => a.includes("94054090") || a.includes("Descartado"))).toBe(true);
  });

  it("usa IA validada quando planilha não tem NCM", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: null,
      candidatosIa: [
        { ncm: "94054090", confianca: 0.9 },
        { ncm: "94052100", confianca: 0.7 },
      ],
    });
    expect(r.ncm).toBe("94052100");
    expect(r.fonte).toBe("ia");
    expect(r.valido).toBe(true);
  });

  it("rejeita NCM inválido da IA sem planilha", () => {
    const r = resolveNcm(catalog, {
      candidatosIa: [{ ncm: "94054090", confianca: 0.95 }],
    });
    expect(r.ncm).toBe("");
    expect(r.fonte).toBe("pendente");
    expect(r.valido).toBe(false);
  });

  it("aceita NCM vigente da planilha", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "94052100",
      candidatosIa: [{ ncm: "94054090", confianca: 0.9 }],
    });
    expect(r.ncm).toBe("94052100");
    expect(r.valido).toBe(true);
    expect(r.descricaoOficial).toContain("diodos");
  });
});
