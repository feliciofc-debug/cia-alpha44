/**
 * Alinhamento orçamento cliente — referência PDF Comex Plus (72 calc / Paulo).
 */

import { describe, it, expect } from "vitest";
import { calcCotacao, PARAMS_SAIDA_PADRAO } from "../src/index.js";

const despesasPaulo = [
  { nome: "AFRMM", valorBRL: 4000, entraBaseNota: true },
  { nome: "Armazenagem", valorBRL: 6000, entraBaseNota: true },
  { nome: "Liberação BL", valorBRL: 2500, entraBaseNota: true },
  { nome: "GNRE", valorBRL: 100, entraBaseNota: true },
  { nome: "Administrativo", valorBRL: 5000, entraBaseNota: false },
  { nome: "Transp+Esc DTA", valorBRL: 3500, entraBaseNota: false },
  { nome: "Transporte SP", valorBRL: 8000, entraBaseNota: true },
  { nome: "Escolta SP", valorBRL: 2500, entraBaseNota: false },
  { nome: "Despacho HON", valorBRL: 4000, entraBaseNota: true },
];

const paramsComexPlus = { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04, ipiAliqSaida: 0 };

describe("alinhamento orçamento Comex Plus", () => {
  it("default markup operacional é 4%", () => {
    expect(PARAMS_SAIDA_PADRAO.markupPct).toBe(0.04);
  });

  it("ipiAliqSaida 0 → DIF IPI credita IPI de entrada integral (PDF Paulo)", () => {
    const r = calcCotacao({
      cambio: 5.4372,
      freteTotalUS: 4000,
      siscomex: 153.24,
      outrasDespesasBaseBRL: 14040,
      params: paramsComexPlus,
      despesas: despesasPaulo,
      itens: [
        {
          ncm: "85280000",
          fobUS: 47596.43,
          pesoLiqKg: 16980.61,
          aliqII: 0.1575,
          aliqIPI: 0.056,
          aliqPIS: 0.021,
          aliqCOFINS: 0.0965,
        },
      ],
    });

    expect(r.saida.difIPI).toBeCloseTo(-r.entrada.ipiTotal, 0.01);
    expect(Math.abs(r.entrada.iiTotal - 44258.77)).toBeLessThan(100);
    expect(Math.abs(r.entrada.ipiTotal - 18157.26)).toBeLessThan(100);
    expect(Math.abs(r.saida.markup - 15630)).toBeLessThan(100);
    expect(Math.abs(r.totalBRL - 164359.48)).toBeLessThan(300);
  });

  it("mix 8423/8479 com IPI 0% — IPI entrada zerado", () => {
    const r = calcCotacao({
      cambio: 5.15,
      freteTotalUS: 3500,
      siscomex: 154.23,
      outrasDespesasBaseBRL: 14040,
      params: paramsComexPlus,
      despesas: despesasPaulo.filter((d) => d.nome !== "GNRE"),
      itens: [
        {
          ncm: "84238900",
          fobUS: 35000,
          pesoLiqKg: 12000,
          aliqII: 0.126,
          aliqIPI: 0,
          aliqPIS: 0.021,
          aliqCOFINS: 0.0965,
        },
        {
          ncm: "84798999",
          fobUS: 12036.67,
          pesoLiqKg: 4941.89,
          aliqII: 0.126,
          aliqIPI: 0,
          aliqPIS: 0.021,
          aliqCOFINS: 0.0965,
        },
      ],
    });

    expect(r.entrada.ipiTotal).toBe(0);
    expect(r.saida.difIPI).toBe(0);
  });
});
