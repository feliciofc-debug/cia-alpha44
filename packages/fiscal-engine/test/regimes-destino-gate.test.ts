/**
 * Gate regimes de destino — Integral byte-identical + casos da legislação.
 */
import { describe, expect, it } from "vitest";
import { aplicarIcmsCotacao } from "@cia/shared";
import { calcCotacao, type CotacaoFiscalInput } from "../src/index.js";

const paramsBase = {
  markupPct: 0.04,
  pisSaida: 0.0165,
  cofinsSaida: 0.076,
  csllSobreMarkup: 0.09,
  irrfAliq: 0.25,
  irrfBaseNotaPct: 0.027,
  ipiTetoAliqMedia: 0.15,
  icmsEntrada: 0,
};

function base66Integral(): Omit<CotacaoFiscalInput, "params"> {
  return {
    cambio: 5.2051,
    freteTotalUS: 3500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 154.23,
    antidumpingBRL: 0,
    outrasDespesasBaseBRL: 14040,
    itens: [
      {
        ncm: "8204.20.00",
        fobUS: 2027.2,
        pesoLiqKg: 1448,
        aliqII: 0.162,
        aliqIPI: 0.052,
        aliqPIS: 0.021,
        aliqCOFINS: 0.0965,
      },
    ],
    despesas: [{ nome: "Transporte SP", valorBRL: 8000, entraBaseNota: true }],
  };
}

function calcComRegime(
  base: Omit<CotacaoFiscalInput, "params">,
  regimeDestinoId: string | null,
  icmsEntradaItem = 0,
) {
  const applied = aplicarIcmsCotacao({
    ufEmpresa: "AL",
    destino: regimeDestinoId?.startsWith("SC") ? "SC" : regimeDestinoId?.startsWith("MG") ? "MG" : "SP",
    regimeIcms: "AL_DIFERIDO",
    icmsSaidaManualFlag: false,
    regimeDestinoId,
    regimeDestinoParams: null,
    params: { ...paramsBase, icmsSaida: 0.04 },
    avisosFiscais: [],
  });
  const itens = base.itens.map((it) => ({
    ...it,
    aliqICMSEntrada: icmsEntradaItem > 0 ? icmsEntradaItem : it.aliqICMSEntrada,
  }));
  const pre = calcCotacao({ ...base, itens, params: applied.params });
  const credito =
    icmsEntradaItem > 0 ? pre.itens.reduce((a, i) => a + i.icmsEntrada, 0) : applied.params.icmsEntrada;
  const params =
    credito > 0 ? { ...applied.params, icmsEntrada: credito } : applied.params;
  const resultado = credito > 0 ? calcCotacao({ ...base, itens, params }) : pre;
  return { applied, resultado, params };
}

/** Cotação sintética US$ 100k — gate legislação. */
function base100k(): Omit<CotacaoFiscalInput, "params"> {
  return {
    cambio: 5.0,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    outrasDespesasBaseBRL: 0,
    itens: [
      {
        ncm: "00000000",
        fobUS: 100_000,
        pesoLiqKg: 1000,
        aliqII: 0.1,
        aliqIPI: 0,
        aliqPIS: 0.021,
        aliqCOFINS: 0.0965,
      },
    ],
    despesas: [],
  };
}

function close(actual: number, expected: number, tol = 1) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe("Gate regimes destino", () => {
  it("Integral — byte-identical ao baseline (sem regimeDestinoId)", () => {
    const integral = calcCotacao({
      ...base66Integral(),
      params: { ...paramsBase, icmsSaida: 0.04 },
    });
    const { resultado } = calcComRegime(base66Integral(), null);
    expect(resultado.totalBRL).toBe(integral.totalBRL);
    expect(resultado.saida.icmsSaida).toBe(integral.saida.icmsSaida);
    expect(resultado.saida.fundosObrigatorios ?? 0).toBe(0);
  });

  it("SC TTD fase 1 — antecipação 2,6%, saída 2,6%, fundos 0,4%", () => {
    const { applied, resultado } = calcComRegime(base100k(), "SC_TTD_FASE1", 0.026);
    expect(applied.meta.icmsSaidaEfetivo).toBeCloseTo(0.026, 5);
    expect(applied.meta.aliqFundos).toBeCloseTo(0.004, 5);
    const antecipado = resultado.itens.reduce((a, i) => a + i.icmsEntrada, 0);
    close(antecipado, 100_000 * 5.0 * 0.026, 5);
    expect(resultado.saida.fundosObrigatorios).toBeGreaterThan(0);
    expect(resultado.saida.icmsSaida).toBeGreaterThan(0);
  });

  it("SC TTD fase 2 — antecipação 1%, saída 1%, fundos 0,4%", () => {
    const { applied, resultado } = calcComRegime(base100k(), "SC_TTD_FASE2", 0.01);
    expect(applied.meta.icmsSaidaEfetivo).toBeCloseTo(0.01, 5);
    const antecipado = resultado.itens.reduce((a, i) => a + i.icmsEntrada, 0);
    close(antecipado, 100_000 * 5.0 * 0.01, 5);
    expect(resultado.saida.fundosObrigatorios).toBeGreaterThan(0);
  });

  it("MG TTS E-commerce — saída 1,3%", () => {
    const { applied, resultado } = calcComRegime(base100k(), "MG_TTS_ECOMMERCE", 0);
    expect(applied.meta.icmsSaidaEfetivo).toBeCloseTo(0.013, 5);
    expect(resultado.saida.fundosObrigatorios ?? 0).toBe(0);
    expect(resultado.totalBRL).toBeGreaterThan(0);
  });
});
