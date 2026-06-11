import { describe, it, expect } from "vitest";
import {
  aplicarDesempateOutros,
  criarNcmCatalog,
  isFolhaGenericaOutros,
  listarNcm8DaPosicao,
  loadNcmVigente,
  montarCandidatosPasse1,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("desempate Outros", () => {
  it("identifica folha genérica Outros/Outras", () => {
    expect(isFolhaGenericaOutros("Outros")).toBe(true);
    expect(isFolhaGenericaOutros("Outras.")).toBe(true);
    expect(isFolhaGenericaOutros("Garrafas térmicas")).toBe(false);
  });

  it("penaliza Outros quando há candidato específico com score >= 80%", () => {
    const ordenados = [
      { ncm: "94052100", score: 1.0, descricao: "Luminárias de teto" },
      { ncm: "94059900", score: 0.85, descricao: "Outros" },
    ];
    const out = aplicarDesempateOutros(catalog, ordenados);
    expect(out[0]!.ncm).toBe("94052100");
    expect(out[out.length - 1]!.ncm).toBe("94059900");
  });
});

describe("ncm-posicoes — passe 1 e passe 2", () => {
  it("garrafa térmica inox inclui posição 9617 nos candidatos", () => {
    const cands = montarCandidatosPasse1(catalog, "Garrafa térmica inox 500ml isolamento vácuo");
    expect(cands.some((c) => c.posicao4 === "9617")).toBe(true);
  });

  it("96170010 é NCM-8 vigente de recipientes isotérmicos (cap. 9617)", () => {
    expect(catalog.existe("96170010")).toBe(true);
    const opcoes = listarNcm8DaPosicao(catalog, "9617");
    expect(opcoes.map((o) => o.ncm)).toContain("96170010");
    expect(opcoes.find((o) => o.ncm === "96170010")!.folha).toMatch(/isotérm/i);
  });

  it("fone bluetooth inclui posição 8518", () => {
    const cands = montarCandidatosPasse1(catalog, "Fone bluetooth TWS earphone wireless");
    expect(cands.some((c) => c.posicao4 === "8518")).toBe(true);
    expect(listarNcm8DaPosicao(catalog, "8518").map((o) => o.ncm)).toContain("85183000");
  });

  it("cadeira escritório inclui posição 9401 e NCM 94013900", () => {
    const desc = "Cadeira de escritório giratória de altura ajustável, estofada, base metálica";
    const cands = montarCandidatosPasse1(catalog, desc);
    expect(cands.some((c) => c.posicao4 === "9401")).toBe(true);
    expect(listarNcm8DaPosicao(catalog, "9401").map((o) => o.ncm)).toContain("94013900");
    expect(catalog.existe("94013900")).toBe(true);
    expect(catalog.descricao("94013900")).toMatch(/Outros/i);
  });
});
