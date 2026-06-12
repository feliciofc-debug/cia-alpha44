import { describe, expect, it } from "vitest";
import { aplicarIcmsCotacao, icmsParamsNovaCotacao } from "../src/icms-cotacao.js";
import { FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL, ICMS_INTERNO_UF } from "../src/icms-uf.js";
import type { ParamsSaida } from "../src/schemas.js";

const paramsBase = (): ParamsSaida => ({
  markupPct: 0.06,
  pisSaida: 0.0165,
  cofinsSaida: 0.076,
  icmsSaida: 0.18,
  csllSobreMarkup: 0.09,
  irrfAliq: 0.25,
  irrfBaseNotaPct: 0.027,
  ipiTetoAliqMedia: 0.15,
  icmsEntrada: 0,
});

describe("icms-cotacao — precedência P2.3", () => {
  it("icmsSaidaManualFlag=true → usa params.icmsSaida, resolver ignorado", () => {
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: true,
      params: { ...paramsBase(), icmsSaida: 0.18 },
      avisosFiscais: ["ICMS de saída legado (18%) difere do calculado (4% — x) — revisar e confirmar"],
    });
    expect(r.params.icmsSaida).toBe(0.18);
    expect(r.meta.icmsSaidaEfetivo).toBe(0.18);
    expect(r.meta.fundamentoSaida).toMatch(/manual/);
    expect(r.meta.avisosFiscais).toHaveLength(1);
  });

  it("icmsSaidaManualFlag=false → resolver manda (AL→SP = 4%)", () => {
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: false,
      params: paramsBase(),
      avisosFiscais: [],
    });
    expect(r.params.icmsSaida).toBe(0.04);
    expect(r.meta.fundamentoSaida).toBe(FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL);
    expect(r.meta.icmsSaidaManualFlag).toBe(false);
  });

  it("recálculo auto preserva avisosFiscais do backfill", () => {
    const aviso = "ICMS de saída legado (18%) difere do calculado (4% — Res. Senado) — revisar e confirmar";
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: false,
      params: { ...paramsBase(), icmsSaida: 0.18 },
      avisosFiscais: [aviso],
    });
    expect(r.params.icmsSaida).toBe(0.04);
    expect(r.meta.avisosFiscais).toEqual([aviso]);
  });

  it("AL→AL interno → 19%", () => {
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "AL",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: false,
      params: paramsBase(),
      avisosFiscais: [],
    });
    expect(r.params.icmsSaida).toBe(ICMS_INTERNO_UF.AL);
  });

  it("NORMAL interestadual → avisoRegimeIcms", () => {
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "NORMAL",
      icmsSaidaManualFlag: false,
      params: paramsBase(),
      avisosFiscais: [],
    });
    expect(r.meta.avisoRegimeIcms).toMatch(/importação/);
    expect(r.params.icmsSaida).toBe(0.04);
  });

  it("icmsParamsNovaCotacao zera flag manual", () => {
    const r = icmsParamsNovaCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: true,
      params: { ...paramsBase(), icmsSaida: 0.18 },
      avisosFiscais: [],
    });
    expect(r.icmsSaidaManualFlag).toBe(false);
    expect(r.params.icmsSaida).toBe(0.04);
  });

  it("confirmarIcmsSaida simulado — flag false + avisos vazios após confirmação humana", () => {
    const r = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: false,
      params: { ...paramsBase(), icmsSaida: 0.18 },
      avisosFiscais: [],
    });
    expect(r.params.icmsSaida).toBe(0.04);
    expect(r.meta.avisosFiscais).toEqual([]);
    expect(r.meta.icmsSaidaManualFlag).toBe(false);
  });
});

describe("P2.4 gate — matriz ufEmpresa × destino × manual × regime", () => {
  const casos: Array<{
    nome: string;
    uf: string;
    dest: string;
    regime: "AL_DIFERIDO" | "NORMAL";
    manual: boolean;
    icmsSalvo: number;
    esperado: number;
  }> = [
    { nome: "66 AL→SP auto", uf: "AL", dest: "SP", regime: "AL_DIFERIDO", manual: false, icmsSalvo: 0.04, esperado: 0.04 },
    { nome: "legado 18% manual", uf: "AL", dest: "SP", regime: "AL_DIFERIDO", manual: true, icmsSalvo: 0.18, esperado: 0.18 },
    { nome: "AL→AL interno", uf: "AL", dest: "AL", regime: "AL_DIFERIDO", manual: false, icmsSalvo: 0.04, esperado: ICMS_INTERNO_UF.AL },
    { nome: "SP→SP interno NORMAL", uf: "SP", dest: "SP", regime: "NORMAL", manual: false, icmsSalvo: 0.04, esperado: 0.18 },
    { nome: "SP→RJ interestadual", uf: "SP", dest: "RJ", regime: "NORMAL", manual: false, icmsSalvo: 0.18, esperado: 0.04 },
    { nome: "manual 12% SP→RJ", uf: "SP", dest: "RJ", regime: "NORMAL", manual: true, icmsSalvo: 0.12, esperado: 0.12 },
  ];

  for (const c of casos) {
    it(c.nome, () => {
      const r = aplicarIcmsCotacao({
        ufEmpresa: c.uf,
        destino: c.dest,
        regimeIcms: c.regime,
        icmsSaidaManualFlag: c.manual,
        params: { ...paramsBase(), icmsSaida: c.icmsSalvo },
        avisosFiscais: [],
      });
      expect(r.params.icmsSaida).toBeCloseTo(c.esperado, 6);
    });
  }
});
