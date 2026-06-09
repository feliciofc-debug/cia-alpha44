import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("resolveNcm — Siscomex fonte única", () => {
  it("substitui NCM desatualizado da planilha (ex.: lustres 94051093)", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "94051093",
      descricao: "Lustre de teto chandelier ceiling light",
      candidatosIa: [{ ncm: "94054090", confianca: 0.9 }],
    });
    expect(r.ncmPlanilhaOriginal).toBe("94051093");
    expect(r.valido).toBe(true);
    expect(catalog.existe(r.ncm)).toBe(true);
    expect(r.ncm).not.toBe("94051093");
    expect(r.ncm).not.toBe("94054090");
    expect(r.avisos.some((a) => a.includes("NÃO existe"))).toBe(true);
  });

  it("mantém NCM da planilha quando vigente na Siscomex", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "94052100",
      candidatosIa: [{ ncm: "94054090", confianca: 0.9 }],
    });
    expect(r.ncm).toBe("94052100");
    expect(r.valido).toBe(true);
    expect(r.fonte).toBe("planilha");
  });

  it("usa IA validada quando planilha sem NCM", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: null,
      candidatosIa: [
        { ncm: "94054090", confianca: 0.9 },
        { ncm: "94052100", confianca: 0.7 },
      ],
    });
    expect(r.ncm).toBe("94052100");
    expect(r.fonte).toBe("ia");
  });

  it("rejeita NCM inválido da IA sem planilha", () => {
    const r = resolveNcm(catalog, {
      candidatosIa: [{ ncm: "94054090", confianca: 0.95 }],
      descricao: "LED panel light",
    });
    expect(r.ncm).not.toBe("94054090");
    if (r.ncm) expect(catalog.existe(r.ncm)).toBe(true);
  });
});

describe("buscarPorTexto Siscomex", () => {
  it("encontra NCMs do capítulo 9405", () => {
    const hits = catalog.buscarPorTexto("lustre luminaria teto", "9405", 3);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.ncm.startsWith("9405"))).toBe(true);
  });
});
