/**
 * Fechamento permanente — planilha 66 (gabarito Plan1).
 *
 * Prova viva: sistema = planilha. Usa os 12 itens reais (Sheet1, linhas 8–19),
 * incluindo as DUAS linhas 9405.21.00 (fixture com 11 itens desvia IRRF ~R$ 138).
 *
 * Ressalva Siscomex (regra 8 — honestidade):
 *   Plan1 C20 = 153,24 (digitado à mão na planilha-fonte)
 *   Engine    = 154,23 (Sheet1!A107 = N3, consistente na base de impostos)
 *   Efeito no TOTAL (C43): ±R$ 0,99 — documentado no último teste deste arquivo.
 *
 * M109 (markup) ≠ J13 (IRRF):
 *   outrasDespesasBaseBRL = 14.040 — base do markup (independente de entraBaseNota)
 *   entraBaseNota — só despesas que entram em J13 (base do IRRF)
 */

import { describe, it, expect } from "vitest";
import { calcCotacao, type CotacaoFiscalInput, type Despesa } from "../src/index.js";

const SISCOMEX_ENGINE = 154.23;
const SISCOMEX_PLANILHA_C20 = 153.24;

/** 12 itens reais — Sheet1 linhas 8–19 (FOB total = 48.679,7). */
const itens: CotacaoFiscalInput["itens"] = [
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

/** Plan1 C24–C32 — entraBaseNota conforme J13 (E13+C16+C21+C24+C25+C26+C27+C30+C32). */
const despesas: Despesa[] = [
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

const cotacao: CotacaoFiscalInput = {
  cambio: 5.2051,
  freteTotalUS: 3500,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  siscomex: SISCOMEX_ENGINE,
  antidumpingBRL: 0,
  itens,
  despesas,
  outrasDespesasBaseBRL: 14040,
  params: {
    markupPct: 0.04,
    pisSaida: 0.0165,
    cofinsSaida: 0.076,
    icmsSaida: 0.04,
    csllSobreMarkup: 0.09,
    irrfAliq: 0.25,
    irrfBaseNotaPct: 0.027,
    ipiTetoAliqMedia: 0.15,
    icmsEntrada: 0,
  },
};

const r = calcCotacao(cotacao);

/** Gabarito Plan1 — valores extraídos da planilha 66 (aba Plan1). */
const PLAN1 = {
  C16_II: 53470.94227117084,
  C17_IPI: 36961.458315064614,
  C18_PIS: 5703.611685870001,
  C19_COFINS: 26209.453699354995,
  C35_DIF_IPI: 11928.464833802842,
  C36_DIF_PIS: 2033.4101601240227,
  C37_DIF_COFINS: 9427.737833708383,
  C38_ICMS_SAIDA: 20387.40934385777,
  C39_CSLL: 1469.3049087892573,
  C40_IRRF: 6441.010140917507,
  C41_MARKUP: 16325.610097658415,
  C43_TOTAL: 226011.65329031862,
  J13_BASE_NOTA: 349571.4987411708,
} as const;

function close(actual: number, expected: number, tol = 0.01) {
  const diff = Math.abs(actual - expected);
  if (diff > tol) {
    throw new Error(`desvio R$ ${diff.toFixed(4)} (esperado ${expected}, obtido ${actual})`);
  }
  expect(diff).toBeLessThanOrEqual(tol);
}

describe("Fechamento planilha 66 — 12 itens + gabarito Plan1", () => {
  it("tem exatamente 12 itens (inclui as duas linhas 9405.21.00)", () => {
    expect(itens).toHaveLength(12);
    expect(r.entrada.fobTotalUS).toBeCloseTo(48679.7, 4);
    expect(r.entrada.pesoLiqTotalKg).toBeCloseTo(17917, 0);
  });

  it("Plan1 C16–C19 — impostos de entrada", () => {
    close(r.entrada.iiTotal, PLAN1.C16_II, 0.01);
    close(r.entrada.ipiTotal, PLAN1.C17_IPI, 0.01);
    close(r.entrada.pisTotal, PLAN1.C18_PIS, 0.01);
    close(r.entrada.cofinsTotal, PLAN1.C19_COFINS, 0.01);
  });

  it("Plan1 C41 + C35–C40 — impostos de saída e markup", () => {
    close(r.saida.markup, PLAN1.C41_MARKUP, 0.01);
    close(r.saida.difIPI, PLAN1.C35_DIF_IPI, 0.01);
    close(r.saida.difPIS, PLAN1.C36_DIF_PIS, 0.01);
    close(r.saida.difCOFINS, PLAN1.C37_DIF_COFINS, 0.01);
    close(r.saida.icmsSaida, PLAN1.C38_ICMS_SAIDA, 0.01);
    close(r.saida.csll, PLAN1.C39_CSLL, 0.01);
    close(r.saida.irrf, PLAN1.C40_IRRF, 0.01);
    close(r.saida.baseNotaSaida, PLAN1.J13_BASE_NOTA, 0.01);
  });

  it("M109 separado: outrasDespesasBaseBRL = 14.040 (markup), distinto de entraBaseNota", () => {
    expect(r.saida.outrasDespesasBaseBRL).toBe(14040);
    const somaEntraBaseNota = despesas
      .filter((d) => d.entraBaseNota !== false)
      .reduce((acc, d) => acc + d.valorBRL, 0);
    expect(somaEntraBaseNota).toBe(24500);
    expect(r.saida.outrasDespesasBaseBRL).not.toBe(somaEntraBaseNota);
  });

  it("Plan1 C43 — TOTAL: engine consistente (Siscomex 154,23) vs planilha (153,24) ±R$ 0,99", () => {
    const totalEngine = r.totalBRL;
    close(totalEngine, 226012.64329031865, 0.01);
    expect(Math.abs(totalEngine - PLAN1.C43_TOTAL)).toBeCloseTo(0.99, 2);
    expect(SISCOMEX_ENGINE - SISCOMEX_PLANILHA_C20).toBeCloseTo(0.99, 2);
  });
});
