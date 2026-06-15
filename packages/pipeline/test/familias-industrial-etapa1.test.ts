import { describe, expect, it } from "vitest";
import {
  criarNcmCatalog,
  detectarFamilia,
  detectarFamilias,
  loadNcmVigente,
  montarCandidatosPasse1,
  textoDeteccaoFamilia,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

function capP1(desc: string, descPt?: string) {
  const texto = textoDeteccaoFamilia(desc, descPt);
  const det = detectarFamilias({ descOriginal: texto });
  const fam = det.conflito ? null : (det.familias[0]?.familia ?? null);
  const p1 = montarCandidatosPasse1(catalog, descPt ?? desc, fam, 25, { descOriginal: texto });
  return { det, fam, p1, caps: p1.map((c) => c.posicao4) };
}

describe("etapa 1 — vocabulário industrial DE", () => {
  it("esmerilhadeira / Winkelschleifer → ferramentas_eletricas (8467)", () => {
    const desc =
      "DE-WZ-2001 — Winkelschleifer 1200W mit Schutzhaube und Zusatzhandgriff";
    const descPt = "Esmerilhadeira angular 1200W com capa protetora";
    const { fam, caps } = capP1(desc, descPt);
    expect(fam?.id).toBe("ferramentas_eletricas");
    expect(caps.some((c) => c.startsWith("8467"))).toBe(true);
  });

  it("bomba bicicleta + alumínio → bombas_ar (8414), sem conflito material", () => {
    const desc = "DE-BK-3001 — Fahrradpumpe Aluminium mit Manometer, Handpumpe";
    const descPt = "Bomba de bicicleta alumínio com manômetro, bomba manual";
    const det = detectarFamilias({ descOriginal: textoDeteccaoFamilia(desc, descPt) });
    expect(det.conflito).toBe(false);
    expect(det.familias.map((f) => f.familia.id)).toEqual(["bombas_ar"]);
    const { caps } = capP1(desc, descPt);
    expect(caps.some((c) => c.startsWith("8414"))).toBe(true);
    expect(caps.some((c) => c.startsWith("7615") || c.startsWith("7606"))).toBe(false);
  });

  it("bomba d'água → bombas_liquido (8413), não bombas_ar", () => {
    const fam = detectarFamilia("Water pump submersible 220V");
    expect(fam?.id).toBe("bombas_liquido");
    expect(fam?.prefixos).toContain("8413");
  });

  it("sensor industrial → sensores_instrumentos, P1 ancora elétrico/instrumento", () => {
    const desc = "DE-SN-4001 — Industrie-Sensor 24V DC Näherungssensor M18";
    const descPt = "Sensor industrial 24V DC sensor de proximidade M18";
    const { fam, caps, p1 } = capP1(desc, descPt);
    expect(fam?.id).toBe("sensores_instrumentos");
    expect(
      caps.some((c) => c.startsWith("8536") || c.startsWith("9026") || c.startsWith("9031")),
    ).toBe(true);
    expect(p1.length).toBeGreaterThan(0);
  });

  it("jogo de chaves / Schraubenschlüssel → ferramentas_manual (8204/8205)", () => {
    const desc = "DE-WRK-SCHR — Schraubenschlüssel-Set 12-teilig metrisch, Chrom-Vanadium";
    const descPt = "Jogo de chaves de boca 12 peças métricas cromo-vanádio";
    const det = detectarFamilias({ descOriginal: textoDeteccaoFamilia(desc, descPt) });
    expect(det.familias.map((f) => f.familia.id)).toContain("ferramentas_manual");
    expect(det.familias.map((f) => f.familia.id)).not.toContain("brinquedos");
    const { caps } = capP1(desc, descPt);
    expect(caps.some((c) => c.startsWith("8204") || c.startsWith("8205"))).toBe(true);
  });
});

describe("etapa 1 — regressão China/patinete intacta", () => {
  it("patinete elétrico → veiculo_leve_eletrico (8711)", () => {
    expect(detectarFamilia("patinete elétrico 350W adulto")?.id).toBe("veiculo_leve_eletrico");
    const cands = montarCandidatosPasse1(catalog, "patinete elétrico 350W", detectarFamilia("patinete elétrico 350W")!);
    expect(cands.some((c) => c.posicao4.startsWith("8711"))).toBe(true);
  });

  it("amortecedor patinete → pecas_veiculo_leve (8714)", () => {
    const det = detectarFamilias({ descOriginal: "Stoßdämpfer hinten für Elektroroller, Ersatzteil", uso: "配件" });
    expect(det.familias.map((f) => f.familia.id)).toContain("pecas_veiculo_leve");
  });

  it("packliste DE — Schraubendreher-Set ainda detecta ferramentas", () => {
    const desc = "DE-WZ-1002 — Schraubendreher-Set 32-teilig, Chrom-Vanadium";
    const fam = detectarFamilia(desc);
    expect(["ferramentas_manual", "ferramentas_maquina"]).toContain(fam?.id);
  });

  it("brinquedos reais ainda detectam (pós-etapa 2)", () => {
    expect(detectarFamilia("boneca de pano infantil")?.id).toBe("brinquedos");
    expect(detectarFamilia("puzzle 1000 peças")?.id).toBe("brinquedos");
    expect(detectarFamilia("jogo de tabuleiro infantil")?.id).toBe("brinquedos");
  });
});
