import { describe, it, expect } from "vitest";
import type { Item } from "@cia/shared";
import { calcCotacao } from "@cia/fiscal-engine";
import { calibrarFobKg, lookupBenchmark, buildBenchmarkIndex, criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import { auditarNcmsParaPdf } from "../src/services/validar-ncm-pdf.js";
import {
  calcAvisoValoracaoFobKg,
  fobKgFinalItem,
  fobUsadoNoEngine,
} from "../src/services/fob-kg-manual.js";
import { calcularCotacao } from "../src/services/cotacao.js";
import type { AppState } from "../src/state.js";

function itemBase(partial: Partial<Item> = {}): Item {
  return {
    descOriginal: "Produto teste",
    descPt: "Produto teste",
    descDuimp: "Produto teste",
    ncm: "94052100",
    ncmCandidatos: [],
    pesoLiqKg: 100,
    pesoBrutoKg: null,
    qtd: 1,
    fobUnitarioUS: null,
    fobTotalUS: 50,
    aliquotas: { ii: 0.16, ipi: 0.05, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ncmValido: true,
    ...partial,
  } as Item;
}

describe("fobKgManual — override soberano", () => {
  const benchmarkIndex = buildBenchmarkIndex([]);
  const benchmark = lookupBenchmark(benchmarkIndex, "94052100");
  const ncmCatalog = criarNcmCatalog(loadNcmVigente());

  it("fobUsadoNoEngine usa manual × peso bruto quando definido", () => {
    const calibracao = calibrarFobKg({
      fobKgOriginal: 0.5,
      benchmark,
      fobTotalUS: 50,
      pesoLiqKg: 100,
    });
    const it = itemBase({ fobKgManual: 2.5, fobTotalUS: 50, pesoBrutoKg: 100 });
    expect(fobUsadoNoEngine(it, calibracao)).toBeCloseTo(250, 4);
    expect(fobKgFinalItem(it, calibracao)).toBeCloseTo(2.5, 4);
  });

  it("fobUsadoNoEngine usa planilha×bruto, não invoice embarque", () => {
    const benchInnove = {
      ...benchmark,
      fonte: "Histórico próprio" as const,
      fobKgMedioDI: 1.9072,
      mediaFobKg: 1.9072,
      fobKgPonderado: 4.5163,
      rastroFonte: "planilha-mensal(2023-S1):media-DI",
    };
    const calibracao = calibrarFobKg({
      fobKgOriginal: 2.15,
      benchmark: benchInnove,
      fobTotalUS: 190.72,
      pesoLiqKg: 100,
      fobKgFonte: "linha",
    });
    const it = itemBase({
      fobTotalUS: 215,
      fobEmbarqueUS: 215,
      pesoLiqKg: 100,
      pesoBrutoKg: 100,
      benchmark: benchInnove,
      fobKgFonte: "linha",
    });
    expect(fobUsadoNoEngine(it, calibracao)).toBeCloseTo(1.9072 * 100, 2);
  });

  it("fobKgManual null usa planilha×bruto quando NCM na planilha", () => {
    const benchInnove = {
      ...benchmark,
      fonte: "Histórico próprio" as const,
      fobKgMedioDI: 1.9072,
      mediaFobKg: 1.9072,
    };
    const calibracao = calibrarFobKg({
      fobKgOriginal: 1.9072,
      benchmark: benchInnove,
      fobTotalUS: 190.72,
      pesoLiqKg: 100,
    });
    const it = itemBase({
      fobKgManual: null,
      fobTotalUS: 215,
      fobEmbarqueUS: 215,
      pesoLiqKg: 100,
      pesoBrutoKg: 100,
      benchmark: benchInnove,
    });
    expect(fobUsadoNoEngine(it, calibracao)).toBeCloseTo(190.72, 2);
  });

  it("avisoValoracao quando manual abaixo do piso — informativo", () => {
    const benchComPiso = {
      ...benchmark,
      pisoDefensavel: 2,
      fonte: "Histórico próprio" as const,
    };
    const aviso = calcAvisoValoracaoFobKg(1, benchComPiso);
    expect(aviso?.abaixoDoDefensavel).toBe(true);
    expect(aviso?.pisoDefensavel).toBe(2);
    expect(aviso?.percentualAbaixo).toBeCloseTo(50, 1);
  });

  it("calcularCotacao com manual recalcula FOB no engine e PDF não bloqueia", () => {
    const state = {
      benchmarkIndex,
      ncmCatalog,
      siscomex: { lookup: () => null },
      ocr: null,
      provider: "mock",
    } as unknown as AppState;

    const cotacao = {
      cambio: 5,
      freteTotalUS: 0,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: 0,
      antidumpingBRL: 0,
      cliente: "teste",
      benefFiscal: "NENHUM" as const,
      moeda: "USD" as const,
      incoterm: "FOB",
      origem: "CN",
      destino: "SP",
      despesas: [],
      params: {
        markupPct: 0.06,
        pisSaida: 0.0065,
        cofinsSaida: 0.03,
        icmsSaida: 0.18,
        csllSobreMarkup: 0.09,
        irrfAliq: 0.015,
        irrfBaseNotaPct: 1,
        ipiTetoAliqMedia: 0.15,
        icmsEntrada: 0,
      },
      itens: [itemBase({ fobKgManual: 0.01, ncm: "94052100", ncmValido: true })],
    };

    const { resultado, itens } = calcularCotacao(cotacao, state);
    expect(resultado).not.toBeNull();
    const fobEngine = itens[0]?.calibracao
      ? fobUsadoNoEngine(itens[0], itens[0].calibracao)
      : 0;
    expect(fobEngine).toBeCloseTo(1, 4);

    expect(() => auditarNcmsParaPdf(itens, ncmCatalog)).not.toThrow();
  });

  it("engine fiscal reflete FOB manual nos totais", () => {
    const manual = 3;
    const peso = 10;
    const it = itemBase({ fobKgManual: manual, pesoLiqKg: peso, fobTotalUS: 5 });
    const calibracao = calibrarFobKg({
      fobKgOriginal: 0.5,
      benchmark,
      fobTotalUS: 5,
      pesoLiqKg: peso,
    });
    const fobUS = fobUsadoNoEngine(it, calibracao);
    const out = calcCotacao({
      cambio: 5,
      freteTotalUS: 0,
      adicionaisVaUS: 0,
      reducaoBaseUS: 0,
      siscomex: 0,
      antidumpingBRL: 0,
      itens: [
        {
          ref: it.ncm,
          ncm: it.ncm,
          fobUS,
          pesoLiqKg: peso,
          aliqII: it.aliquotas.ii,
          aliqIPI: it.aliquotas.ipi,
          aliqPIS: it.aliquotas.pis,
          aliqCOFINS: it.aliquotas.cofins,
          aliqICMSEntrada: 0,
        },
      ],
      despesas: [],
      params: {
        markupPct: 0.06,
        pisSaida: 0.0065,
        cofinsSaida: 0.03,
        icmsSaida: 0.18,
        csllSobreMarkup: 0.09,
        irrfAliq: 0.015,
        irrfBaseNotaPct: 1,
        ipiTetoAliqMedia: 0.15,
        icmsEntrada: 0,
      },
    });
    expect(out.entrada.fobTotalUS).toBeCloseTo(manual * peso, 2);
  });
});
