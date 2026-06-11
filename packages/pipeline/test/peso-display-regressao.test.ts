import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { calcCotacao, type CotacaoFiscalInput } from "@cia/fiscal-engine";
import {
  buildBenchmarkIndex,
  preencherFobKgPlanilha,
  aplicarRegrasFobItens,
  PRECO_CUSTO_PATINETE_USD,
  pesoLiqReal,
  resolvePesoLiqRateio,
  detectarBasePesoFob,
} from "../src/index.js";
import type { LinhaCrua } from "../src/linha.js";
import fatura16 from "./fixtures/fatura-16-fob.json";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..", "..", "..");

const PARAMS_FISCAIS = {
  markupPct: 0.06,
  pisSaida: 0.0165,
  cofinsSaida: 0.076,
  icmsSaida: 0.04,
  csllSobreMarkup: 0.09,
  irrfAliq: 0.25,
  irrfBaseNotaPct: 0.027,
  ipiTetoAliqMedia: 0.15,
  icmsEntrada: 0,
};

function engineInput(
  itens: Array<{
    ncm: string;
    fobUS: number;
    pesoLiqKg: number;
    pesoBrutoKg: number | null;
    aliqII?: number;
    aliqIPI?: number;
  }>,
): CotacaoFiscalInput {
  return {
    cambio: 5.0211,
    freteTotalUS: 5500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 154.23,
    antidumpingBRL: 0,
    itens: itens.map((it, i) => ({
      ref: String(i),
      ncm: it.ncm,
      fobUS: it.fobUS,
      pesoLiqKg: resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg }),
      aliqII: it.aliqII ?? 0.18,
      aliqIPI: it.aliqIPI ?? 0.35,
      aliqPIS: 0.021,
      aliqCOFINS: 0.0965,
      aliqICMSEntrada: 0,
    })),
    despesas: [],
    params: PARAMS_FISCAIS,
  };
}

/** Simula armazenamento antigo: pesoLiqKg do item = peso de rateio (bruto quando ambos existem). */
function engineInputLegado(
  itens: Array<{ ncm: string; fobUS: number; pesoLiqKg: number; pesoBrutoKg: number | null; aliqII?: number; aliqIPI?: number }>,
): CotacaoFiscalInput {
  return {
    cambio: 5.0211,
    freteTotalUS: 5500,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 154.23,
    antidumpingBRL: 0,
    itens: itens.map((it, i) => ({
      ref: String(i),
      ncm: it.ncm,
      fobUS: it.fobUS,
      pesoLiqKg: it.pesoLiqKg,
      aliqII: it.aliqII ?? 0.18,
      aliqIPI: it.aliqIPI ?? 0.35,
      aliqPIS: 0.021,
      aliqCOFINS: 0.0965,
      aliqICMSEntrada: 0,
    })),
    despesas: [],
    params: PARAMS_FISCAIS,
  };
}

function assertTributosIdenticos(
  a: ReturnType<typeof calcCotacao>,
  b: ReturnType<typeof calcCotacao>,
) {
  expect(a.entrada.fobTotalUS).toBeCloseTo(b.entrada.fobTotalUS, 2);
  expect(a.entrada.iiTotal).toBeCloseTo(b.entrada.iiTotal, 2);
  expect(a.entrada.ipiTotal).toBeCloseTo(b.entrada.ipiTotal, 2);
  expect(a.entrada.pisTotal).toBeCloseTo(b.entrada.pisTotal, 2);
  expect(a.entrada.cofinsTotal).toBeCloseTo(b.entrada.cofinsTotal, 2);
  expect(a.entrada.pesoLiqTotalKg).toBeCloseTo(b.entrada.pesoLiqTotalKg, 2);
}

describe("peso display — blindagem fiscal (totais inalterados)", () => {
  it("fatura 92: FOB DI ~77.391 e II/IPI/PIS/COFINS idênticos pré/pós exibição", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/fatura-92-limpa-classificar.json"), "utf8"),
    ) as { linhas: LinhaCrua[] };

    const index = buildBenchmarkIndex([]);
    const { linhas } = preencherFobKgPlanilha(json.linhas, index);
    const comRegras = aplicarRegrasFobItens(
      linhas.map((l) => ({
        descOriginal: l.descOriginal,
        descPt: l.descOriginal,
        descDuimp: "",
        ncm: l.ncm ?? "87116000",
        ncmCandidatos: [],
        pesoLiqKg: pesoLiqReal(l),
        pesoBrutoKg: l.pesoBrutoKg,
        qtd: l.qtd,
        fobUnitarioUS: l.fobUnitarioUS,
        fobTotalUS: l.fobTotalUS ?? 0,
        aliquotas: { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
        aliquotasOverride: false,
        anuencia: [],
        antidumping: false,
        uso: l.uso ?? undefined,
      })),
      index,
    );

    const fobDi = comRegras.reduce((s, it) => s + it.fobTotalUS, 0);
    expect(fobDi).toBeGreaterThan(77300);
    expect(fobDi).toBeLessThan(77500);

    const base = comRegras.map((it) => ({
      ncm: it.ncm ?? "87116000",
      fobUS: it.fobTotalUS,
      pesoLiqKg: pesoLiqReal({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg }),
      pesoBrutoKg: it.pesoBrutoKg,
    }));

    const legado = base.map((it) => ({
      ...it,
      pesoLiqKg: resolvePesoLiqRateio(it),
    }));

    const novo = calcCotacao(engineInput(base));
    const antigo = calcCotacao(engineInputLegado(legado));
    assertTributosIdenticos(novo, antigo);

    const liqExib = base.reduce((s, it) => s + it.pesoLiqKg, 0);
    const brutoExib = base.reduce((s, it) => s + (it.pesoBrutoKg ?? 0), 0);
    expect(liqExib).toBeGreaterThan(14000);
    expect(liqExib).toBeLessThan(14500);
    expect(brutoExib).toBeGreaterThan(16000);
    expect(brutoExib).toBeLessThan(16500);
    expect(Math.abs(liqExib - brutoExib)).toBeGreaterThan(1000);
  });

  it("fatura 16: 27/27 base bruta intacta", () => {
    expect(fatura16.itens).toHaveLength(27);
    for (const it of fatura16.itens) {
      const det = detectarBasePesoFob({
        fobTotalUS: it.fobTotalUS,
        pesoBrutoKg: it.pesoBrutoKg,
        pesoLiqKg: it.pesoLiqKg,
        fobKgReferencia: fatura16.fobKgPlanilha,
      });
      expect(det.fobKgBase).toBe("bruto");
    }

    const base = fatura16.itens.map((it) => ({
      ncm: it.ncm,
      fobUS: it.fobTotalUS,
      pesoLiqKg: it.pesoLiqKg,
      pesoBrutoKg: it.pesoBrutoKg,
      aliqII: 0.162,
      aliqIPI: 0.0975,
    }));

    const legado = base.map((it) => ({
      ...it,
      pesoLiqKg: resolvePesoLiqRateio(it),
    }));

    assertTributosIdenticos(calcCotacao(engineInput(base)), calcCotacao(engineInputLegado(legado)));
  });
});

describe("pesoLiqReal vs resolvePesoLiqRateio", () => {
  it("patinete fatura 92: exibição líq ≠ rateio bruto", () => {
    const l = { pesoLiqKg: 10000, pesoBrutoKg: 11500 };
    expect(pesoLiqReal(l)).toBe(10000);
    expect(resolvePesoLiqRateio(l)).toBe(11500);
  });
});
