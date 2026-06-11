import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Item } from "@cia/shared";
import {
  buildBenchmarkIndex,
  detectarBasePesoFob,
  resolverFobKgPlanilha,
  aplicarRegrasFobItens,
  PRECO_CUSTO_PATINETE_USD,
  substituirHistoricoBenchmark,
  FOB_KG_FONTE_PRECO_CUSTO,
  FOB_KG_FONTE_PENDENTE,
  FOB_KG_FONTE_LINHA,
  type LinhaCrua,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fatura16 = JSON.parse(
  readFileSync(join(here, "fixtures/fatura-16-fob.json"), "utf8"),
) as {
  fobKgPlanilha: number;
  itens: Array<{
    descricao: string;
    ncm: string;
    pesoBrutoKg: number;
    pesoLiqKg: number;
    fobTotalUS: number;
    fobKgPlanilha: number;
  }>;
};

function linha(partial: Partial<LinhaCrua> & Pick<LinhaCrua, "descOriginal">): LinhaCrua {
  return {
    ncm: "94051190",
    qtd: 1,
    pesoBrutoKg: 50,
    pesoLiqKg: 50,
    fobUnitarioUS: null,
    fobTotalUS: null,
    ...partial,
  };
}

function itemBase(partial: Partial<Item> & Pick<Item, "descOriginal">): Item {
  return {
    descPt: partial.descOriginal,
    descDuimp: "",
    ncm: "94051190",
    ncmCandidatos: [],
    pesoBrutoKg: 50,
    pesoLiqKg: 50,
    qtd: 1,
    fobUnitarioUS: null,
    fobTotalUS: 0,
    aliquotas: { ii: 0, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ...partial,
  } as Item;
}

describe("detectarBasePesoFob", () => {
  it("fatura 16: fobKg 2,109588 × bruto reconcilia", () => {
    const r = detectarBasePesoFob({
      fobTotalUS: 780.5475542527346,
      pesoBrutoKg: 370,
      pesoLiqKg: 356,
      fobKgReferencia: 2.109588,
    });
    expect(r.fobKgBase).toBe("bruto");
    expect(r.avisos.some((a) => a.includes("CIF aduaneiro"))).toBe(true);
  });

  it("reconciliação impossível — aviso fornecedor", () => {
    const r = detectarBasePesoFob({
      fobTotalUS: 1000,
      pesoBrutoKg: 100,
      pesoLiqKg: 80,
      fobKgReferencia: 2.109588,
    });
    expect(r.fobKgBase).toBe("indeterminado");
    expect(r.avisos[0]).toMatch(/não reconcilia/i);
  });

  it("empate com pesoBruto == pesoLiq — indeterminado sem aviso", () => {
    const r = detectarBasePesoFob({
      fobTotalUS: 210.9588,
      pesoBrutoKg: 100,
      pesoLiqKg: 100,
      fobKgReferencia: 2.109588,
    });
    expect(r.fobKgBase).toBe("indeterminado");
    expect(r.avisos).toHaveLength(0);
  });
});

describe("resolver FOB/kg — trava e rastro", () => {
  const indexVazio = buildBenchmarkIndex([]);

  it("herança intra-carga dist≤4 → ncm-irmao", () => {
    const { linhas, metas } = resolverFobKgPlanilha(
      [
        linha({
          descOriginal: "Lustre ref",
          ncm: "94052100",
          pesoBrutoKg: 100,
          pesoLiqKg: 100,
          fobTotalUS: 211,
        }),
        linha({ descOriginal: "Lustre sem FOB", ncm: "94051190", pesoBrutoKg: 50, pesoLiqKg: 50 }),
      ],
      indexVazio,
    );
    expect(linhas[1]?.fobTotalUS).toBeCloseTo(105.5, 0);
    expect(metas[1]?.fobKgFonte).toBe("ncm-irmao(94052100)");
  });

  it("cap 94 numa carga só cap 87 → pendente, não herda", () => {
    const { linhas, metas } = resolverFobKgPlanilha(
      [
        linha({
          descOriginal: "Patinete ref",
          ncm: "87116000",
          pesoBrutoKg: 10,
          pesoLiqKg: 10,
          fobTotalUS: 1090,
        }),
        linha({
          descOriginal: "Lustre estranho",
          ncm: "94051190",
          pesoBrutoKg: 50,
          pesoLiqKg: 50,
          fobTotalUS: null,
        }),
      ],
      indexVazio,
    );
    expect(linhas[1]?.fobTotalUS ?? 0).toBe(0);
    expect(metas[1]?.fobKgFonte).toBe(FOB_KG_FONTE_PENDENTE);
    expect(metas[1]?.fobPendente).toBe(true);
  });

  it("preço-custo → fobKgFonte preco-custo (não linha)", () => {
    const { metas } = resolverFobKgPlanilha(
      [linha({ descOriginal: "PATINETE ELÉTRICO", ncm: "87116000", qtd: 10 })],
      indexVazio,
    );
    expect(metas[0]?.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
  });

  it("benchmark ComexStat identificado com rastro ponderada", () => {
    substituirHistoricoBenchmark([]);
    const index = buildBenchmarkIndex(
      [{ ncm: "94051190", desc: "Lustre", fobKg: 2.5, cifKg: 2.6, amostra: 3 }],
      "1º semestre 2023",
      { comexstatPeriodo: "2023-S1" },
    );
    const { metas, linhas } = resolverFobKgPlanilha(
      [linha({ descOriginal: "Lustre isolado", ncm: "94051190", fobTotalUS: null, pesoLiqKg: 10 })],
      index,
    );
    expect(linhas[0]?.fobTotalUS).toBeGreaterThan(0);
    expect(metas[0]?.fobKgFonte).toBe("comexstat(2023-S1):ponderada");
  });

  it("benchmark planilha mensal identificado com rastro media-DI", () => {
    substituirHistoricoBenchmark([
      { ncm: "94051190", fobKgMedioDI: 2.11, fobKg: 2.11, amostra: 2 },
    ]);
    const index = buildBenchmarkIndex([], "ref", { planilhaPeriodo: "2023-S1" });
    const { metas } = resolverFobKgPlanilha(
      [linha({ descOriginal: "Lustre", ncm: "94051190", fobTotalUS: null, pesoLiqKg: 100 })],
      index,
    );
    expect(metas[0]?.fobKgFonte).toBe("planilha-mensal(2023-S1):media-DI");
  });
});

describe("fatura 16 — 27/27 base bruta", () => {
  it("todas as linhas reconciliam fobKg × pesoBruto", () => {
    const linhas: LinhaCrua[] = fatura16.itens.map((it) => ({
      descOriginal: it.descricao,
      ncm: it.ncm,
      qtd: 1,
      pesoBrutoKg: it.pesoBrutoKg,
      pesoLiqKg: it.pesoLiqKg,
      fobUnitarioUS: null,
      fobTotalUS: it.fobTotalUS,
    }));
    const fobKgMap = new Map(linhas.map((_, i) => [i, fatura16.fobKgPlanilha]));
    const { metas } = resolverFobKgPlanilha(linhas, buildBenchmarkIndex([]), fobKgMap);

    expect(metas).toHaveLength(27);
    for (let i = 0; i < 27; i++) {
      const it = fatura16.itens[i]!;
      const det = detectarBasePesoFob({
        fobTotalUS: it.fobTotalUS,
        pesoBrutoKg: it.pesoBrutoKg,
        pesoLiqKg: it.pesoLiqKg,
        fobKgReferencia: it.fobKgPlanilha,
      });
      expect(det.fobKgBase).toBe("bruto");
      expect(it.fobTotalUS).toBeCloseTo(it.fobKgPlanilha * it.pesoBrutoKg, 2);
      expect(metas[i]?.fobKgFonte).toBe(FOB_KG_FONTE_LINHA);
    }
  });
});

describe("aplicarRegrasFobItens — recálculo patinete", () => {
  beforeEach(() => substituirHistoricoBenchmark([]));

  it("reaplica preco-custo no recálculo", () => {
    const index = buildBenchmarkIndex([]);
    const [out] = aplicarRegrasFobItens(
      [
        itemBase({
          descOriginal: "PATINETE ELÉTRICO",
          ncm: "87116000",
          qtd: 724,
          fobTotalUS: 1,
          fobUnitarioUS: 1,
        }),
      ],
      index,
    );
    expect(out!.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(out!.fobUnitarioUS).toBe(PRECO_CUSTO_PATINETE_USD);
    expect(out!.fobTotalUS).toBeCloseTo(724 * 109, 0);
  });
});
