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
      [
        linha({
          descOriginal: "PATINETE ELÉTRICO",
          ncm: "87116000",
          qtd: 10,
          pesoLiqKg: 200,
        }),
      ],
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

describe("fatura 92 — FOB DI patinetes (preco-custo só produto completo)", () => {
  beforeEach(() => substituirHistoricoBenchmark([]));

  it("710 patinetes × US$ 109 ≈ US$ 77,4k — partes mantêm FOB da linha", () => {
    const index = buildBenchmarkIndex([]);
    const linhas: LinhaCrua[] = [
      {
        descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色）",
        ncm: "87116000",
        qtd: 500,
        uso: "骑行",
        pesoLiqKg: 10000,
        pesoBrutoKg: 11500,
        fobUnitarioUS: 140.58,
        fobTotalUS: 70290,
      },
      {
        descOriginal: "ES-T19A-10WHI — 滑板车T1 MAX 10寸500W款（白色）",
        ncm: "87116000",
        qtd: 210,
        uso: "骑行",
        pesoLiqKg: 4200,
        pesoBrutoKg: 4830,
        fobUnitarioUS: 140.58,
        fobTotalUS: 29521.8,
      },
      {
        descOriginal: "ACC-ES-SSA001 — 减震器",
        ncm: "87149990",
        qtd: 4,
        uso: "配件",
        pesoLiqKg: 16,
        pesoBrutoKg: 16.4,
        fobUnitarioUS: 0.12,
        fobTotalUS: 0.48,
      },
      {
        descOriginal: "ACC-ES-042 — 控制器",
        ncm: "87149990",
        qtd: 10,
        uso: "配件",
        pesoLiqKg: 6,
        pesoBrutoKg: 6.5,
        fobUnitarioUS: 0.1,
        fobTotalUS: 1,
      },
    ];

    const { linhas: resolvidas, metas } = resolverFobKgPlanilha(linhas, index);
    expect(metas[0]?.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(metas[2]?.fobKgFonte).not.toBe(FOB_KG_FONTE_PRECO_CUSTO);

    const itens: Item[] = resolvidas.map((l, i) =>
      itemBase({
        descOriginal: l.descOriginal,
        descPt:
          i >= 2
            ? "Peça para patinete elétrico"
            : l.descOriginal,
        ncm: l.ncm ?? "00000000",
        qtd: l.qtd,
        pesoLiqKg: l.pesoLiqKg ?? 0,
        pesoBrutoKg: l.pesoBrutoKg,
        fobTotalUS: l.fobTotalUS ?? 0,
        fobUnitarioUS: l.fobUnitarioUS,
        fobKgFonte: metas[i]?.fobKgFonte,
        uso: linhas[i]!.uso ?? undefined,
      }),
    );

    const recalc = aplicarRegrasFobItens(itens, index);
    const fobPatinetes = recalc.slice(0, 2).reduce((s, it) => s + it.fobTotalUS, 0);
    expect(fobPatinetes).toBeCloseTo(710 * PRECO_CUSTO_PATINETE_USD, 0);
    expect(recalc[2]!.fobKgFonte).not.toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(recalc[2]!.fobTotalUS).toBeCloseTo(0.48, 2);
    expect(recalc[3]!.fobTotalUS).toBeCloseTo(1, 2);
    expect(fobPatinetes).toBeLessThan(79400);
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
          pesoLiqKg: 14480,
          fobTotalUS: 1,
          fobUnitarioUS: 1,
          uso: "骑行",
        }),
      ],
      index,
    );
    expect(out!.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(out!.fobUnitarioUS).toBe(PRECO_CUSTO_PATINETE_USD);
    expect(out!.fobTotalUS).toBeCloseTo(724 * 109, 0);
  });

  it("peça com descPt patinete e uso 配件 → fonte linha (nunca preco-custo)", () => {
    const index = buildBenchmarkIndex([]);
    const [out] = aplicarRegrasFobItens(
      [
        itemBase({
          descOriginal: "ACC-ES-SSA001 — 减震器",
          descPt: "Amortecedor para patinete elétrico",
          ncm: "87149990",
          qtd: 4,
          pesoLiqKg: 16,
          fobTotalUS: 0.48,
          fobUnitarioUS: 0.12,
          fobKgFonte: FOB_KG_FONTE_LINHA,
          uso: "配件",
        }),
      ],
      index,
    );
    expect(out!.fobKgFonte).toBe(FOB_KG_FONTE_LINHA);
    expect(out!.fobUnitarioUS).toBe(0.12);
    expect(out!.fobTotalUS).toBe(0.48);
  });
});
