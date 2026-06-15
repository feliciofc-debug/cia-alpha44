import { describe, expect, it } from "vitest";
import {
  criarNcmCatalog,
  detectarFamilia,
  detectarFamilias,
  loadNcmVigente,
  montarCandidatosPasse1,
  ncmCoerenteComFamilia,
  resolveNcm,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

function capPrincipal(desc: string) {
  const fam = detectarFamilia(desc);
  const p1 = montarCandidatosPasse1(catalog, desc, fam, 15, { descOriginal: desc });
  return { fam, caps: p1.map((c) => c.posicao4.slice(0, 2)), p1 };
}

const CHAPAS_ARMADILHA = [
  ["CHP-LF-1MM", "CHP-LF-1MM chapa laminada aço carbono 1mm espessura"],
  ["CHP-LF-3MM", "CHP-LF-3MM chapa laminada frio 3mm aço baixo carbono"],
  ["CHP-LQ-6MM", "CHP-LQ-6MM chapa laminada quente 6mm"],
  ["CHP-GALV-2MM", "CHP-GALV-2MM chapa galvanizada 2mm aço zincado"],
  ["CHP-INOX-4MM", "CHP-INOX-4MM chapa aço inox 4mm laminada"],
  ["CHP-VAGA-5MM", "CHP-VAGA-5MM chapa aço 5mm espessura variável"],
];

describe("etapa 3 — chapas siderúrgicas (anti-regressão armadilha)", () => {
  for (const [sku, desc] of CHAPAS_ARMADILHA) {
    it(`${sku} → siderurgico_plano / cap 72 (não 73)`, () => {
      const { fam, caps } = capPrincipal(desc);
      expect(fam?.id).toBe("siderurgico_plano");
      expect(fam?.prefixos).toContain("72");
      expect(caps.some((c) => c === "72")).toBe(true);
      expect(caps.some((c) => c === "73")).toBe(false);
      expect(detectarFamilias(desc).familias.map((f) => f.familia.id)).not.toContain("metal_ferro_aco");
    });
  }

  it("IA 72085200 coerente com siderurgico_plano (guard não rejeita)", () => {
    const fam = detectarFamilia("CHP-LF-3MM chapa laminada frio 3mm")!;
    expect(ncmCoerenteComFamilia("72085200", fam)).toBe(true);
    expect(ncmCoerenteComFamilia("73239300", fam)).toBe(false);
  });

  it("resolveNcm aceita candidato IA cap 72 (não força 7323)", () => {
    const desc = "CHP-LF-3MM chapa laminada frio 3mm aço baixo carbono";
    const fam = detectarFamilia(desc);
    const r = resolveNcm(catalog, {
      descOriginal: desc,
      descPt: desc,
      descricao: desc,
      candidatosIa: [{ ncm: "72269200", confianca: 0.92, descricaoOficial: "Chapa laminada plana" }],
    });
    expect(r.ncm.startsWith("72")).toBe(true);
    expect(r.ncm).not.toMatch(/^7323/);
    expect(r.avisos.some((a) => /rejeitado.*7323/i.test(a))).toBe(false);
    expect(fam?.id).toBe("siderurgico_plano");
  });
});

describe("etapa 3 — utensílios aço (não quebrar)", () => {
  it("Kochtopf / jogo de panelas → cozinha_utensilios / 73", () => {
    const desc = "Jogo de panelas aço inox 5 peças com tampa de vidro";
    expect(detectarFamilia(desc)?.id).toBe("cozinha_utensilios");
    const { caps } = capPrincipal(desc);
    expect(caps.some((c) => c === "73")).toBe(true);
  });

  it("Peça aço genérica → metal_ferro_aco / 73", () => {
    expect(detectarFamilia("Peça aço")?.id).toBe("metal_ferro_aco");
    const { caps } = capPrincipal("Peça aço uso doméstico");
    expect(caps.some((c) => c === "73")).toBe(true);
  });

  it("balde de aço inox → metal_ferro_aco / 73 (não cap 72)", () => {
    const desc = "Balde de aço inox 12 litros uso doméstico";
    expect(detectarFamilia(desc)?.id).toBe("metal_ferro_aco");
    expect(detectarFamilias(desc).familias.map((f) => f.familia.id)).not.toContain("siderurgico_plano");
    const { caps } = capPrincipal(desc);
    expect(caps.some((c) => c === "73")).toBe(true);
  });

  it("talher inox → metal_ferro_aco / 73", () => {
    expect(detectarFamilia("Jogo talheres inox 24 peças")?.id).toBe("metal_ferro_aco");
  });
});

describe("etapa 3 — intactos (não tocar)", () => {
  it("garrafa térmica inox → recipientes_isotermicos / 96 (não 72)", () => {
    const desc = "Garrafa térmica aço inox 500ml isolamento vácuo";
    expect(detectarFamilia(desc)?.id).toBe("recipientes_isotermicos");
    const { caps } = capPrincipal(desc);
    expect(caps.some((c) => c === "96")).toBe(true);
    expect(detectarFamilias(desc).familias.map((f) => f.familia.id)).not.toContain("siderurgico_plano");
  });

  it("parafuso → parafusos_fixadores / 73.18", () => {
    const fam = detectarFamilia("Parafuso sextavado M8x40 zincado");
    expect(fam?.id).toBe("parafusos_fixadores");
    expect(fam?.prefixos.some((p) => p.startsWith("7318"))).toBe(true);
  });

  it("patinete elétrico → veiculo_leve_eletrico / 87", () => {
    const { fam, caps } = capPrincipal("Patinete elétrico scooter 350W");
    expect(fam?.id).toBe("veiculo_leve_eletrico");
    expect(caps.some((c) => c === "87")).toBe(true);
  });

  it("amortecedor patinete → pecas_veiculo_leve / 8714", () => {
    const det = detectarFamilias({ descOriginal: "Amortecedor traseiro patinete elétrico", uso: "配件" });
    expect(det.familias.map((f) => f.familia.id)).toContain("pecas_veiculo_leve");
  });
});

describe("etapa 3 — precedência chapa inox vs material", () => {
  it("chapa aço inox 4mm → siderurgico_plano (vence metal_ferro_aco/aluminio)", () => {
    const desc = "CHP-INOX-4MM chapa aço inox 4mm laminada";
    const det = detectarFamilias(desc);
    expect(det.familias.map((f) => f.familia.id)).toContain("siderurgico_plano");
    expect(det.familias.map((f) => f.familia.id)).not.toContain("metal_ferro_aco");
    expect(detectarFamilia(desc)?.id).toBe("siderurgico_plano");
  });
});
