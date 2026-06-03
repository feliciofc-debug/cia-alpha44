import { describe, it, expect } from "vitest";
import { calcCotacao, type CotacaoFiscalInput, type Despesa } from "../src/index.js";

/**
 * Validação do motor fiscal contra a PLANILHA 66 (66 - - 13-03-2026.xlsx),
 * decodificada célula a célula (abas Sheet1 e Plan1).
 *
 * Nota de honestidade (regra 8 do CIA): a planilha-fonte usa DOIS valores de
 * Siscomex — 154,23 na base de impostos (Sheet1!A107=N3) e 153,24 no total
 * (Plan1!C20, célula digitada à mão). O motor usa UM único Siscomex consistente
 * (154,23), o que o torna internamente correto; por isso o TOTAL do motor
 * (226.012,64) difere em exatos R$ 0,99 do TOTAL exibido na planilha
 * (226.011,65) — a diferença é a própria inconsistência da planilha.
 */

const SISCOMEX = 154.23;

// 12 itens reais da planilha 66 (Sheet1, linhas 8-19).
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

// Taxas locais reais (Plan1 C24:C32), total 35.500. `entraBaseNota` marca as que
// entram na BASE NOTA SAÍDA (Plan1 J13: AFRMM, BL, Armazenagem, ANVISA, Transp SP, Despacho).
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
  siscomex: SISCOMEX,
  antidumpingBRL: 0,
  itens,
  despesas,
  // Base de despesas do markup (M109 na planilha = 14.040). Na planilha-mãe este
  // valor é uma entrada independente das taxas locais operacionais.
  outrasDespesasBaseBRL: 14040,
  params: {
    markupPct: 0.04, // a planilha 66 usou 4% (o default do produto é 6%)
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

/** Comparação com tolerância absoluta (centavos). */
function close(actual: number, expected: number, tol = 0.01) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

describe("Engine CIA/Alpha 44 — cascata de ENTRADA (planilha 66)", () => {
  it("item 8204.20.00: CIF/kg, II, IPI, PIS, COFINS exatos", () => {
    const i = r.itens[0]!;
    close(i.cifKgUS, 1.5953452028799466, 1e-9);
    close(i.ii, 1947.90299226717, 1e-6);
    close(i.ipi, 726.5437679305646, 1e-6);
    close(i.pis, 252.50594344204058, 1e-6);
    close(i.cofins, 1160.3249305789004, 1e-6);
  });

  it("frete/kg global e peso líquido total", () => {
    close(r.itens[0]!.freteKgGlobal, 3500 / 17917, 1e-12);
    close(r.entrada.pesoLiqTotalKg, 17917, 1e-9);
    close(r.entrada.fobTotalUS, 48679.7, 1e-9);
  });

  it("totais de entrada (II/IPI/PIS/COFINS) e CIF em R$", () => {
    close(r.entrada.iiTotal, 53470.94227117084, 1e-4);
    close(r.entrada.ipiTotal, 36961.458315064614, 1e-4);
    close(r.entrada.pisTotal, 5703.611685870001, 1e-4);
    close(r.entrada.cofinsTotal, 26209.453699354995, 1e-4);
    close(r.entrada.cifTotalBRL, 271600.55646999995, 1e-4);
    close(r.entrada.impostosEntradaTotal, 122499.69597146045, 1e-4);
  });
});

describe("Engine CIA/Alpha 44 — cascata de SAÍDA (planilha 66)", () => {
  it("alíquota média de IPI ponderada por FOB", () => {
    close(r.saida.aliqMediaIPI, 0.11517987066477403, 1e-9);
  });

  it("markup (4%) sobre o custo nacionalizado", () => {
    close(r.saida.markup, 16325.610097658415, 1e-4);
  });

  it("DIF IPI / PIS / COFINS e ICMS de saída", () => {
    close(r.saida.difIPI, 11928.464833802842, 1e-3);
    close(r.saida.difPIS, 2033.4101601240227, 1e-3);
    close(r.saida.difCOFINS, 9427.737833708383, 1e-3);
    close(r.saida.icmsSaida, 20387.40934385777, 1e-3);
  });

  it("CSLL, IRRF e BASE NOTA SAÍDA", () => {
    close(r.saida.csll, 1469.3049087892573, 1e-4);
    close(r.saida.irrf, 6441.010140917507, 1e-4);
    close(r.saida.baseNotaSaida, 349571.4987411708, 1e-3);
  });
});

describe("Engine CIA/Alpha 44 — TOTAL global", () => {
  it("total consistente (Siscomex único) = 226.012,64", () => {
    close(r.totalBRL, 226012.64329031865, 0.01);
    close(r.totalUS, 226012.64329031865 / 5.2051, 0.01);
  });

  it("difere em ~R$ 0,99 do total da planilha (inconsistência de Siscomex da fonte)", () => {
    const totalPlanilha = 226011.65329031862;
    expect(Math.abs(r.totalBRL - totalPlanilha)).toBeCloseTo(0.99, 2);
  });
});
