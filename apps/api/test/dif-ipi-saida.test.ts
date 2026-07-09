import { describe, expect, it } from "vitest";
import { PARAMS_SAIDA_PADRAO } from "@cia/fiscal-engine";
import { buildBenchmarkIndex, criarNcmCatalog, loadComexSeed, loadNcmVigenteCache } from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";
import { calcularCotacao } from "../src/services/cotacao.js";
import type { AppState } from "../src/state.js";

function stateTeste(): AppState {
  const comex = loadComexSeed();
  return {
    benchmarkIndex: buildBenchmarkIndex(comex.itens, comex.contexto),
    ncmCatalog: criarNcmCatalog(loadNcmVigenteCache()),
    siscomex: { lookup: () => null },
    ocr: null,
    provider: "mock",
  } as unknown as AppState;
}

function itemFiscal(parcial: Pick<Item, "descOriginal" | "ncm" | "fobTotalUS" | "pesoLiqKg" | "aliquotas">): Item {
  return {
    descOriginal: parcial.descOriginal,
    descPt: parcial.descOriginal,
    descDuimp: parcial.descOriginal,
    ncm: parcial.ncm,
    ncmCandidatos: [],
    ncmFonte: "planilha-cliente",
    ncmValido: true,
    pesoBrutoKg: parcial.pesoLiqKg,
    pesoLiqKg: parcial.pesoLiqKg,
    qtd: 1,
    fobUnitarioUS: parcial.fobTotalUS,
    fobTotalUS: parcial.fobTotalUS,
    fobEmbarqueUS: parcial.fobTotalUS,
    fobKgFonte: "preco-custo",
    aliquotas: parcial.aliquotas,
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
  };
}

function cotacaoTeste(params: Cotacao["params"]): Cotacao {
  return {
    cliente: "DIF IPI sanity",
    benefFiscal: "NENHUM",
    moeda: "USD",
    cambio: 5,
    freteTotalUS: 0,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    siscomex: 0,
    antidumpingBRL: 0,
    incoterm: "FOB",
    origem: "CN",
    destino: "SP",
    despesas: [],
    outrasDespesasBaseBRL: 0,
    params,
    itens: [
      itemFiscal({
        descOriginal: "patinete eletrico",
        ncm: "87116000",
        fobTotalUS: 1000,
        pesoLiqKg: 100,
        aliquotas: { ii: 0.35, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
      }),
      itemFiscal({
        descOriginal: "massageador",
        ncm: "90191000",
        fobTotalUS: 500,
        pesoLiqKg: 50,
        aliquotas: { ii: 0.2, ipi: 0.052, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
      }),
    ],
  };
}

describe("DIF IPI saída", () => {
  it("usa a alíquota média ponderada dos itens e ignora o zero legado do frontend", () => {
    const paramsLegados = { ...PARAMS_SAIDA_PADRAO, markupPct: 0.04, ipiAliqSaida: 0 };
    const { resultado, params } = calcularCotacao(cotacaoTeste(paramsLegados), stateTeste());

    const aliqMediaEsperada = (1000 * 0.35 + 500 * 0.052) / 1500;
    expect(params.ipiAliqSaida).toBeUndefined();
    expect(resultado.saida.aliqMediaIPI).toBeCloseTo(aliqMediaEsperada, 10);
    expect(resultado.saida.aliqMediaIPI).toBeGreaterThan(0);

    const entrada = resultado.entrada;
    const baseIpiAlta =
      entrada.cifTotalBRL +
      (entrada.impostosEntradaTotal - entrada.ipiTotal - entrada.pisTotal - entrada.cofinsTotal) +
      resultado.saida.outrasDespesasBaseBRL +
      resultado.saida.markup;
    const difEsperado = aliqMediaEsperada * baseIpiAlta - entrada.ipiTotal;

    expect(resultado.saida.aliqMediaIPI).toBeGreaterThan(params.ipiTetoAliqMedia);
    expect(resultado.saida.difIPI).toBeCloseTo(difEsperado, 6);
    expect(resultado.saida.difIPI).not.toBeCloseTo(-entrada.ipiTotal, 6);
  });
});
