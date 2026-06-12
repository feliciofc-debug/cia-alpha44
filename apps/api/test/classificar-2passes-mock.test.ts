import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import { criarMockProvider } from "../src/llm/mock.js";
import {
  PRODUTOS_PROVA_CLASSIFICACAO,
  PROMPT_PASSE2_VERSION,
  SYSTEM_PASSE2,
} from "../src/llm/prompt-2passes.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);
const CADEIRA_GABARITO = PRODUTOS_PROVA_CLASSIFICACAO[2];

describe("prompt-2passes — versão auditável", () => {
  it("PROMPT_PASSE2_V4 com regra 9401.31/39, 8708×8714 e Nota 2 Seção XVII", () => {
    expect(PROMPT_PASSE2_VERSION).toBe("PROMPT_PASSE2_V4");
    expect(SYSTEM_PASSE2).toContain("9401.31/39");
    expect(SYSTEM_PASSE2).toContain("87.08");
    expect(SYSTEM_PASSE2).toContain("87.14");
    expect(SYSTEM_PASSE2).toContain("NOTA 2 DA SEÇÃO XVII");
    expect(CADEIRA_GABARITO).toContain("de altura ajustável");
  });
});

describe("mock classify2Passes — determinístico CI", () => {
  it("garrafa térmica inox → 9617 / 96170010 (não 7323)", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: PRODUTOS_PROVA_CLASSIFICACAO[0] },
    ]);
    expect(r!.posicaoPasse1).toBe("9617");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("96170010");
    expect(r!.ncmCandidatos[0]!.ncm.startsWith("7323")).toBe(false);
    expect(catalog.existe(r!.ncmCandidatos[0]!.ncm)).toBe(true);
  });

  it("fone bluetooth TWS → 8518 / 85183000", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: PRODUTOS_PROVA_CLASSIFICACAO[1] },
    ]);
    expect(r!.posicaoPasse1).toBe("8518");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("85183000");
  });

  it("cadeira escritório → 9401 / 94013900 (não 94017100 metal)", async () => {
    const [r] = await mock.classify2Passes!(catalog, [{ descOriginal: CADEIRA_GABARITO }]);
    expect(r!.posicaoPasse1).toBe("9401");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("94013900");
    expect(r!.ncmCandidatos[0]!.ncm).not.toBe("94017100");
    expect(r!.avisoMaterial).toBeUndefined();
    expect(r!.avisoAtributo).toBeUndefined();
  });

  it("cadeira sem material informado emite avisoMaterial", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Cadeira escritório giratória de altura ajustável" },
    ]);
    expect(r!.ncmCandidatos[0]!.ncm).toBe("94013900");
    expect(r!.avisoMaterial).toMatch(/material não informado/i);
  });

  it("cadeira sem altura ajustável informada emite avisoAtributo", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Cadeira de escritório giratória estofada, base metálica" },
    ]);
    expect(r!.ncmCandidatos[0]!.ncm).toBe("94013900");
    expect(r!.avisoAtributo).toMatch(/atributo determinante não informado: altura ajustável/i);
  });

  it("amortecedor patinete elétrico → 8714 / 87141000 (não 8708)", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      {
        descOriginal: "减震器 Shock Absorber, veículo: patinete elétrico",
        material: "铁",
        uso: "配件",
      },
    ]);
    expect(r!.posicaoPasse1).toBe("8714");
    expect(r!.ncmCandidatos[0]!.ncm).toBe("87141000");
    expect(r!.ncmCandidatos[0]!.ncm.startsWith("8708")).toBe(false);
  });

  it("idioma inventado → sem NCM, nunca 01012100", async () => {
    const [r] = await mock.classify2Passes!(catalog, [
      { descOriginal: "Xylophar quendrix moltava zephyr kranix blorpt fenwick" },
    ]);
    expect(r!.ncmCandidatos).toHaveLength(0);
    expect(r!.classificacaoBaixaConfianca).toBe(true);
    expect(r!.justificativaRGI).toMatch(/pendente/i);
  });
});

const PACKLISTE_DE = [
  { desc: "DE-WZ-1001 — Akku-Bohrschrauber 18V mit 2 Akkus und Koffer", cap: "84" },
  { desc: "DE-WZ-1002 — Schraubendreher-Set 32-teilig, Chrom-Vanadium", cap: "82" },
  { desc: "DE-KU-2001 — Thermoskanne Edelstahl 1L, doppelwandig vakuumisoliert", cap: "96" },
  { desc: "DE-KU-2002 — Kochtopf-Set 5-teilig Edelstahl mit Glasdeckel", cap: "73" },
  { desc: "DE-EL-3001 — Bluetooth-Kopfhörer TWS mit Ladecase", cap: "85" },
  { desc: "DE-EL-3002 — USB-C Ladegerät 65W GaN Schnellladegerät", cap: "85" },
  { desc: "DE-EL-3003 — LED-Deckenleuchte rund 24W, dimmbar, nur LED-Lichtquelle", cap: "94" },
  { desc: "DE-MB-4001 — Bürostuhl drehbar, höhenverstellbar, gepolstert, Metallgestell", cap: "94" },
  { desc: "DE-SP-5001 — Elektroroller 350W, 10 Zoll Räder, klappbar", cap: "87" },
  { desc: "DE-SP-5002 — Kinderroller mit 3 Rädern, LED-Räder, bis 50 kg", cap: "95" },
  { desc: "DE-AT-6001 — Stoßdämpfer hinten für Elektroroller, Ersatzteil", cap: "87" },
  { desc: "DE-AT-6002 — Sechskantschrauben M8x40 verzinkt, VPE 100", cap: "73" },
  { desc: "DE-TX-7001 — Mikrofaser-Handtuch-Set 3-teilig, 80% Polyester 20% Polyamid", cap: "63" },
  { desc: "DE-TX-7002 — Herren T-Shirt Baumwolle, gestrickt, verschiedene Größen", cap: "61" },
];

describe("mock classify2Passes — packliste DE (P2b descPt)", () => {
  it("≥12/14 itens no capítulo correto via tradução mock", async () => {
    const outs = await mock.classify2Passes!(
      catalog,
      PACKLISTE_DE.map((p) => ({ descOriginal: p.desc })),
    );
    expect(outs).toHaveLength(14);
    let acertos = 0;
    for (let i = 0; i < PACKLISTE_DE.length; i++) {
      const ncm = outs[i]!.ncmCandidatos[0]?.ncm ?? "";
      const cap = ncm.slice(0, 2);
      if (cap === PACKLISTE_DE[i]!.cap) acertos++;
    }
    expect(acertos).toBeGreaterThanOrEqual(12);
  });
});
