import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("resolveNcm — Gemini validado Siscomex", () => {
  it("planilha-cliente prevalece sobre Gemini quando fonte planilha-cliente", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "84732910",
      fonteClassificacao: "planilha-cliente",
      candidatosIa: [{ ncm: "84238900", confianca: 0.95 }],
      descOriginal: "Balança de gancho",
    });
    expect(r.fonte).toBe("planilha-cliente");
    expect(r.ncm).toBe("84238900");
    expect(r.valido).toBe(true);
  });

  it("planilha-cliente-familia retorna fonte correta", () => {
    const r = resolveNcm(catalog, {
      fonteClassificacao: "planilha-cliente-familia",
      candidatosIa: [{ ncm: "84798999", confianca: 0.85 }],
      descOriginal: "Tosquiadeira para pets",
    });
    expect(r.fonte).toBe("planilha-cliente-familia");
    expect(r.ncm).toBe("84798999");
  });

  it("planilha-china retorna fonte própria, sem virar planilha-cliente", () => {
    const r = resolveNcm(catalog, {
      fonteClassificacao: "planilha-china",
      candidatosIa: [{ ncm: "84231000", confianca: 0.9 }],
      descOriginal: "Balança de gancho portátil",
      descPt: "Balança de gancho portátil",
    });
    expect(r.fonte).toBe("planilha-china");
    expect(r.ncm).toBe("84231000");
    expect(r.valido).toBe(true);
  });

  it("prevalece sobre NCM da coluna embarque quando fonte gemini (fallback)", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "84732910",
      fonteClassificacao: "gemini",
      candidatosIa: [{ ncm: "84798999", confianca: 0.92 }],
      descOriginal: "Massageador corporal elétrico",
    });
    expect(r.fonte).toBe("gemini");
    expect(r.ncm).toBe("84798999");
    expect(r.valido).toBe(true);
    expect(catalog.existe(r.ncm)).toBe(true);
    expect(r.ncmPlanilhaOriginal).toBe("84732910");
  });

  it("rejeita NCM Gemini inexistente na TEC e faz fallback legado", () => {
    const r = resolveNcm(catalog, {
      fonteClassificacao: "gemini",
      candidatosIa: [{ ncm: "99999999", confianca: 0.95 }],
      descOriginal: "Garrafa térmica inox",
      descPt: "Garrafa térmica inox",
    });
    expect(r.fonte).not.toBe("gemini");
    expect(r.avisos.some((a) => a.includes("Gemini sem NCM válido"))).toBe(true);
    if (r.ncm) expect(catalog.existe(r.ncm)).toBe(true);
  });

  it("sem fonte gemini mantém planilha vigente", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "84732910",
      candidatosIa: [{ ncm: "84798999", confianca: 0.92 }],
      descOriginal: "Outras máquinas",
    });
    expect(r.fonte).toBe("planilha");
    expect(r.ncm).toBe("84732910");
  });

  it("gemini inválido não cai no NCM da planilha — fallback legado", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "84732910",
      fonteClassificacao: "gemini",
      candidatosIa: [{ ncm: "99999999", confianca: 0.95 }],
      descOriginal: "Massageador corporal elétrico",
    });
    expect(r.fonte).not.toBe("planilha");
    expect(r.ncm).not.toBe("84732910");
  });
});
