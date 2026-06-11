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

  it("confiança IA < 0,6: mantém NCM da IA + aviso revisar (não Siscomex)", () => {
    const r = resolveNcm(catalog, {
      descricao: "配件 spare part scooter",
      candidatosIa: [{ ncm: "87141000", confianca: 0.55 }],
    });
    expect(r.fonte).toBe("ia");
    expect(r.ncm).toBe("87141000");
    expect(r.avisos.some((a) => a.includes("baixa confiança"))).toBe(true);
  });

  it("sem candidato IA → fallback Siscomex", () => {
    const r = resolveNcm(catalog, {
      descricao: "parafuso sextavado metal",
      candidatosIa: [],
    });
    expect(r.ncm).toBeTruthy();
    expect(catalog.existe(r.ncm)).toBe(true);
    expect(r.fonte).toBe("siscomex");
  });
});

describe("família pecas_veiculo_leve (item 3c)", () => {
  it("detecta 配件 + amortecedor e inclui 8714/8708 nos candidatos passe 1", () => {
    const desc = "减震器 / Shock Absorber, material 铁, uso 配件";
    const candidatos = montarCandidatosPasse1(catalog, desc, null);
    const pos4 = candidatos.map((c) => c.posicao4);
    expect(pos4.some((p) => p.startsWith("8714") || p.startsWith("8708"))).toBe(true);
    expect(pos4.some((p) => p.startsWith("8211"))).toBe(false);
  });
});
