import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm, montarCandidatosPasse1 } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("resolveNcm — partes genéricas (item 3a)", () => {
  it("mantém candidato IA 8714xx mesmo com busca Siscomex disponível", () => {
    const r = resolveNcm(catalog, {
      descricao: "减震器 Shock Absorber 配件",
      candidatosIa: [{ ncm: "87141000", confianca: 0.85 }],
    });
    expect(r.fonte).toBe("ia");
    expect(r.ncm).toBe("87141000");
    expect(r.avisos.some((a) => a.includes("inferido pela tabela Siscomex"))).toBe(false);
  });

  it("confiança IA < 0,6: rejeita IA arbitrária — Siscomex ou pendente", () => {
    const r = resolveNcm(catalog, {
      descricao: "配件 spare part scooter",
      candidatosIa: [{ ncm: "87141000", confianca: 0.55 }],
    });
    expect(r.fonte).not.toBe("ia");
    if (r.fonte === "siscomex") {
      expect(catalog.existe(r.ncm)).toBe(true);
    } else {
      expect(r.fonte).toBe("pendente");
      expect(r.ncm).toBe("");
    }
    expect(r.avisos.some((a) => /classificação pendente|confiança IA/i.test(a))).toBe(true);
  });

  it("sem candidato IA → fallback Siscomex", () => {
    const r = resolveNcm(catalog, {
      descOriginal: "parafuso sextavado metal",
      candidatosIa: [],
    });
    expect(r.ncm).toBeTruthy();
    expect(catalog.existe(r.ncm)).toBe(true);
    expect(r.fonte).toBe("siscomex");
  });

  it("IA 90319090 mantida como fonte ia mesmo com uso 配件 (não filtra guard-rail)", () => {
    const r = resolveNcm(catalog, {
      descOriginal: "ACC-ES-018 — 仪表",
      uso: "配件",
      candidatosIa: [{ ncm: "90319090", confianca: 0.85 }],
    });
    expect(r.fonte).toBe("ia");
    expect(r.ncm).toBe("90319090");
  });

  it("fallback Siscomex usa descOriginal (滑板车) quando textoClassificacaoIa não encontra", () => {
    const descOriginal = "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色）";
    const descPt = "Scooter T1 MAX 10 polegadas 500W";
    const descricao = `${descOriginal} · Tradução PT: ${descPt} · Material: 铁 · Uso: 骑行`;
    const r = resolveNcm(catalog, {
      descOriginal,
      descPt,
      uso: "骑行",
      descricao,
      candidatosIa: [],
    });
    expect(r.ncm).toBe("87116000");
    expect(r.fonte).toBe("siscomex");
  });
});

describe("família pecas_veiculo_leve (item 3c)", () => {
  it("detecta 配件 + amortecedor e inclui 8714/8708 nos candidatos passe 1", () => {
    const desc = "减震器 / Shock Absorber";
    const candidatos = montarCandidatosPasse1(
      catalog,
      "减震器 / Shock Absorber · Material: 铁 · Uso: 配件",
      null,
      25,
      { descOriginal: desc, uso: "配件" },
    );
    const pos4 = candidatos.map((c) => c.posicao4);
    expect(pos4.some((p) => p.startsWith("8714") || p.startsWith("8708"))).toBe(true);
    expect(pos4.some((p) => p.startsWith("8211"))).toBe(false);
  });
});
