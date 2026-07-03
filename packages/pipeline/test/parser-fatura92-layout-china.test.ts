import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBenchmarkIndex } from "../src/benchmark.js";
import { detectarCustoOrfaoVeiculo } from "../src/custo-orfao-veiculo.js";
import { parsePlanilhaRows } from "../src/parser.js";
import { resolverFobKgPlanilha, FOB_KG_FONTE_PRECO_CUSTO } from "../src/resolver-fob-kg.js";
import type { LinhaCrua } from "../src/linha.js";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..", "..", "..");

const fixture = JSON.parse(
  fs.readFileSync(path.join(ROOT, "tools/fixtures/fatura-92-layout-china.json"), "utf8"),
) as { sheet: string; header: string[]; rows: unknown[][] };

function parseFixture() {
  return parsePlanilhaRows([fixture.header, ...fixture.rows], fixture.sheet);
}

function paraLinhaCrua(l: ReturnType<typeof parseFixture>["linhas"][number]): LinhaCrua {
  return {
    descOriginal: l.descricao,
    ncm: l.ncm,
    qtd: l.qtd,
    qtdCaixas: l.qtdCaixas ?? null,
    qtdPorCaixa: l.qtdPorCaixa ?? null,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobUnitarioUS: l.precoUnitario,
    fobTotalUS: l.fobTotalUS,
    valoresSemCabecalho: l.valoresSemCabecalho,
    material: l.material ?? null,
    uso: l.uso ?? null,
  };
}

describe("parser fatura China embarque 92 — layout 巴西发票模板", () => {
  it("detecta qtd caixa ×申报数量, pesos totais e NCMs declarados", () => {
    const parsed = parseFixture();

    expect(parsed.linhas).toHaveLength(13);
    const [preto, branco, amortecedor, parafuso] = parsed.linhas;

    expect(preto!.qtd).toBe(500);
    expect(branco!.qtd).toBe(210);
    expect(preto!.qtdCaixas).toBe(500);
    expect(preto!.qtdPorCaixa).toBe(1);
    expect(preto!.pesoBrutoKg).toBe(11500);
    expect(preto!.pesoLiqKg).toBe(10000);
    expect(branco!.pesoBrutoKg).toBe(4830);
    expect(branco!.pesoLiqKg).toBe(4200);
    expect(preto!.precoUnitario).toBe(140.58);
    expect(preto!.valoresSemCabecalho).toEqual([109, 54500]);
    expect(branco!.valoresSemCabecalho).toEqual([109, 22890]);
    expect(preto!.descricao).toContain("ES-T19A-10BLK");

    expect(preto!.ncm).toBe("87116000");
    expect(branco!.ncm).toBe("87116000");
    expect(amortecedor!.ncm).toBe("87141000");
    expect(parafuso!.ncm).toBe("87141000");
    expect(parsed.linhas[4]!.ncm).toBe("73181500");
  });

  it("detecta custo órfão 109 automaticamente e FOB = custo × quantidade", () => {
    const index = buildBenchmarkIndex([]);
    const linhas = parseFixture().linhas.map(paraLinhaCrua);

    expect(detectarCustoOrfaoVeiculo(linhas[0]!)).toMatchObject({
      custoUnitarioUS: 109,
      fobTotalUS: 54500,
    });

    const { linhas: resolvidas, metas } = resolverFobKgPlanilha(linhas, index);

    expect(metas[0]?.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(metas[1]?.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(metas[0]?.fobKgAvisos?.[0]).toContain("custo detectado na planilha");
    expect(resolvidas[0]!.fobUnitarioUS).toBe(109);
    expect(resolvidas[1]!.fobUnitarioUS).toBe(109);
    expect(resolvidas[0]!.fobTotalUS).toBeCloseTo(54500, 2);
    expect(resolvidas[1]!.fobTotalUS).toBeCloseTo(22890, 2);
    expect(resolvidas[2]!.fobTotalUS).toBeCloseTo(0.48, 4);
  });

  it("validação matemática falha → mantém fallback de pré-preenchimento com 申报单价", () => {
    const index = buildBenchmarkIndex([]);
    const linhas = parseFixture().linhas.map(paraLinhaCrua);
    const invalidas = linhas.map((l, idx) =>
      idx < 2 ? { ...l, valoresSemCabecalho: [88, 12345] } : l,
    );

    expect(detectarCustoOrfaoVeiculo(invalidas[0]!)).toBeNull();

    const { linhas: resolvidas, metas } = resolverFobKgPlanilha(invalidas, index);
    expect(metas[0]?.fobKgFonte).toBe(FOB_KG_FONTE_PRECO_CUSTO);
    expect(resolvidas[0]!.fobUnitarioUS).toBe(140.58);
    expect(resolvidas[0]!.fobTotalUS).toBeCloseTo(140.58 * 500, 2);
  });

  it("isolamento: sem 箱数/申报数量, quantidade total existente continua soberana", () => {
    const parsed = parsePlanilhaRows(
      [
        ["Modelo", "Descrição", "NCM", "Total Qty", "Unit Price"],
        ["ES-T19A", "Patinete elétrico", "87116000", 710, 109],
      ],
      "layout-generico",
    );

    expect(parsed.linhas).toHaveLength(1);
    expect(parsed.linhas[0]!.qtd).toBe(710);
    expect(parsed.linhas[0]!.qtdCaixas ?? null).toBeNull();
    expect(parsed.linhas[0]!.qtdPorCaixa ?? null).toBeNull();
  });
});
