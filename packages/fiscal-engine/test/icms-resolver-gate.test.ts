/**
 * P2.4 gate bloqueante — calcCotacao + aplicarIcmsCotacao (fixtures 66/92 + matriz ICMS).
 * Diffs reportados quando legado manual 18% diverge do resolver auto 4%.
 */
import { describe, expect, it } from "vitest";
import { aplicarIcmsCotacao, FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL } from "@cia/shared";
import { calcCotacao, type CotacaoFiscalInput, type Despesa } from "../src/index.js";

const SISCOMEX_66 = 154.23;

const itens66: CotacaoFiscalInput["itens"] = [
  { ncm: "8204.20.00", fobUS: 2027.2, pesoLiqKg: 1448, aliqII: 0.162, aliqIPI: 0.052, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "9405.21.00", fobUS: 1917, pesoLiqKg: 1278, aliqII: 0.162, aliqIPI: 0.0975, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "9405.21.00", fobUS: 2773.5, pesoLiqKg: 1849, aliqII: 0.162, aliqIPI: 0.0975, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "8714.10.00", fobUS: 2670, pesoLiqKg: 1068, aliqII: 0.144, aliqIPI: 0.09, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "4202.92.00", fobUS: 1989, pesoLiqKg: 663, aliqII: 0.35, aliqIPI: 0.065, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "8525.89.29", fobUS: 27000, pesoLiqKg: 4952, aliqII: 0.2, aliqIPI: 0.15, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "8504.40.10", fobUS: 1818, pesoLiqKg: 1212, aliqII: 0.18, aliqIPI: 0.05, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "8509.80.90", fobUS: 2118.4, pesoLiqKg: 1324, aliqII: 0.18, aliqIPI: 0.065, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "7326.90.90", fobUS: 2228.7, pesoLiqKg: 1173, aliqII: 0.18, aliqIPI: 0.05, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "8536.61.00", fobUS: 800.4, pesoLiqKg: 667, aliqII: 0.16, aliqIPI: 0.0975, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "9019.10.00", fobUS: 800.7, pesoLiqKg: 471, aliqII: 0.2, aliqIPI: 0.052, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
  { ncm: "7615.10.00", fobUS: 2536.8, pesoLiqKg: 1812, aliqII: 0.25, aliqIPI: 0.065, aliqPIS: 0.021, aliqCOFINS: 0.0965 },
];

const despesas66: Despesa[] = [
  { nome: "AFRMM", valorBRL: 4000, entraBaseNota: true },
  { nome: "Armazenagem", valorBRL: 6000, entraBaseNota: true },
  { nome: "Liberação BL", valorBRL: 2500, entraBaseNota: true },
  { nome: "Registro ANVISA/INMETRO", valorBRL: 0, entraBaseNota: true },
  { nome: "Administrativo", valorBRL: 5000, entraBaseNota: false },
  { nome: "Transp+Esc DTA", valorBRL: 3500, entraBaseNota: false },
  { nome: "Transporte SP", valorBRL: 8000, entraBaseNota: true },
  { nome: "Escolta SP", valorBRL: 2500, entraBaseNota: false },
  { nome: "Despacho HON", valorBRL: 4000, entraBaseNota: true },
];

const paramsBase66 = {
  markupPct: 0.04,
  pisSaida: 0.0165,
  cofinsSaida: 0.076,
  csllSobreMarkup: 0.09,
  irrfAliq: 0.25,
  irrfBaseNotaPct: 0.027,
  ipiTetoAliqMedia: 0.15,
  icmsEntrada: 0,
};

function base66(): Omit<CotacaoFiscalInput, "params"> {
  return {
    cambio: 5.2051,
    freteTotalUS: 3500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: SISCOMEX_66,
    antidumpingBRL: 0,
    itens: itens66,
    despesas: despesas66,
    outrasDespesasBaseBRL: 14040,
  };
}

function calc66(opts: {
  ufEmpresa: string;
  destino: string;
  regimeIcms: "AL_DIFERIDO" | "NORMAL";
  manual: boolean;
  icmsSalvo: number;
  avisosFiscais?: string[];
}) {
  const applied = aplicarIcmsCotacao({
    ufEmpresa: opts.ufEmpresa,
    destino: opts.destino,
    regimeIcms: opts.regimeIcms,
    icmsSaidaManualFlag: opts.manual,
    params: { ...paramsBase66, icmsSaida: opts.icmsSalvo },
    avisosFiscais: opts.avisosFiscais ?? [],
  });
  const r = calcCotacao({ ...base66(), params: applied.params });
  return { applied, resultado: r };
}

function close(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe("P2.4 gate — planilha 66 + resolver ICMS", () => {
  it("AL→SP auto (4%) bate baseline engine-66", () => {
    const { applied, resultado } = calc66({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      manual: false,
      icmsSalvo: 0.04,
    });
    expect(applied.meta.icmsSaidaEfetivo).toBe(0.04);
    expect(applied.meta.fundamentoSaida).toBe(FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL);
    close(resultado.totalBRL, 226012.64329031865, 0.01);
    close(resultado.saida.icmsSaida, 20387.40934385777, 1);
  });

  it("legado 18% manual mantém ICMS e total mais alto que auto", () => {
    const auto = calc66({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      manual: false,
      icmsSalvo: 0.18,
    });
    const legado = calc66({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      manual: true,
      icmsSalvo: 0.18,
      avisosFiscais: ["ICMS de saída legado (18%) difere do calculado (4%) — revisar e confirmar"],
    });
    expect(legado.applied.params.icmsSaida).toBe(0.18);
    expect(legado.applied.meta.avisosFiscais).toHaveLength(1);
    expect(auto.resultado.saida.icmsSaida).toBeLessThan(legado.resultado.saida.icmsSaida);
    expect(auto.resultado.totalBRL).toBeLessThan(legado.resultado.totalBRL);
    const diffIcms = legado.resultado.saida.icmsSaida - auto.resultado.saida.icmsSaida;
    const diffTotal = legado.resultado.totalBRL - auto.resultado.totalBRL;
    expect(diffIcms).toBeGreaterThan(50_000);
    expect(diffTotal).toBeGreaterThan(50_000);
  });
});

describe("P2.4 gate — matriz uf×dest×manual×regime (engine)", () => {
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
    { nome: "SP→RJ interestadual auto", uf: "SP", dest: "RJ", regime: "NORMAL", manual: false, icmsSalvo: 0.18, esperado: 0.04 },
    { nome: "manual 12% SP→RJ", uf: "SP", dest: "RJ", regime: "NORMAL", manual: true, icmsSalvo: 0.12, esperado: 0.12 },
  ];

  for (const c of casos) {
    it(c.nome, () => {
      const { applied } = calc66({
        ufEmpresa: c.uf,
        destino: c.dest,
        regimeIcms: c.regime,
        manual: c.manual,
        icmsSalvo: c.icmsSalvo,
      });
      expect(applied.params.icmsSaida).toBeCloseTo(c.esperado, 6);
    });
  }

  it("SP→RJ auto reduz ICMS vs legado 18% salvo (diff reportado)", () => {
    const auto = calc66({
      ufEmpresa: "SP",
      destino: "RJ",
      regimeIcms: "NORMAL",
      manual: false,
      icmsSalvo: 0.18,
    });
    const legado = calc66({
      ufEmpresa: "SP",
      destino: "RJ",
      regimeIcms: "NORMAL",
      manual: true,
      icmsSalvo: 0.18,
    });
    expect(auto.applied.params.icmsSaida).toBe(0.04);
    expect(legado.applied.params.icmsSaida).toBe(0.18);
    expect(auto.resultado.saida.icmsSaida).toBeLessThan(legado.resultado.saida.icmsSaida);
  });
});

describe("P2.4 gate — fatura 92 (subset scooters, AL→SP)", () => {
  const itens92: CotacaoFiscalInput["itens"] = [
    {
      ncm: "87116000",
      fobUS: 54500,
      pesoLiqKg: 11500,
      aliqII: 0.18,
      aliqIPI: 0.35,
      aliqPIS: 0.021,
      aliqCOFINS: 0.0965,
    },
    {
      ncm: "87116000",
      fobUS: 22890,
      pesoLiqKg: 4830,
      aliqII: 0.18,
      aliqIPI: 0.35,
      aliqPIS: 0.021,
      aliqCOFINS: 0.0965,
    },
  ];

  it("AL→SP auto 4% — engine fecha com total positivo", () => {
    const applied = aplicarIcmsCotacao({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: false,
      params: {
        ...paramsBase66,
        markupPct: 0.06,
        icmsSaida: 0.18,
      },
      avisosFiscais: [],
    });
    expect(applied.params.icmsSaida).toBe(0.04);
    const r = calcCotacao({
      cambio: 5.0211,
      freteTotalUS: 5500,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: 154.23,
      antidumpingBRL: 0,
      itens: itens92,
      despesas: [{ nome: "Despacho", valorBRL: 4000, entraBaseNota: true }],
      outrasDespesasBaseBRL: 0,
      params: applied.params,
    });
    expect(r.totalBRL).toBeGreaterThan(400_000);
    expect(r.saida.icmsSaida).toBeGreaterThan(0);
    expect(applied.meta.fundamentoSaida).toBe(FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL);
  });
});
