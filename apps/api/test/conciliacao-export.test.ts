import { describe, it, expect } from "vitest";
import { gerarConciliacaoBuffer, gerarXlsxConciliacao } from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";

const cotacao: Cotacao = {
  cliente: "0617滑板车",
  benefFiscal: "ALAGOAS",
  moeda: "US$",
  cambio: 5.02,
  freteTotalUS: 5500,
  adicionaisVaUS: 0,
  reducaoBaseUS: 0,
  siscomex: 154.23,
  antidumpingBRL: 0,
  incoterm: "CFR",
  origem: "RJ",
  destino: "SP",
  itens: [],
  despesas: [],
  params: {
    markupPct: 0.06,
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

const item: Item = {
  descOriginal: "ES-T19A — 滑板车T1 MAX",
  descPt: "Patinete elétrico",
  descDuimp: "",
  ncm: "87116000",
  ncmCandidatos: [{ ncm: "87116000", confianca: 0.97 }],
  ncmConfianca: 0.97,
  ncmFonte: "ia",
  pesoBrutoKg: 11500,
  pesoLiqKg: 10000,
  qtd: 500,
  fobUnitarioUS: 109,
  fobTotalUS: 54500,
  aliquotas: { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
  aliquotasOverride: false,
  anuencia: [],
  antidumping: false,
  fobKgFonte: "preco-custo",
  uso: "骑行",
  material: "高碳钢",
};

describe("conciliacao export — buffer", () => {
  it("XLSX > 1KB com conteúdo válido", async () => {
    const buf = await gerarXlsxConciliacao({ cotacao, itens: [item], provider: "mock" });
    expect(buf.length).toBeGreaterThan(1024);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
  });

  it("CSV e XLSX via gerarConciliacaoBuffer", async () => {
    const csv = await gerarConciliacaoBuffer({ cotacao, itens: [item] }, "csv");
    const xlsx = await gerarConciliacaoBuffer({ cotacao, itens: [item] }, "xlsx");
    expect(csv[0]).toBe(0xef);
    expect(xlsx.subarray(0, 2).toString()).toBe("PK");
  });
});
