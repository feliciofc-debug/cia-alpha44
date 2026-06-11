import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlanilhaRows } from "../src/parser.js";
import { preencherFobKgPlanilha } from "../src/fob-kg-planilha.js";
import { FOB_KG_FONTE_LINHA, FOB_KG_FONTE_PENDENTE } from "../src/resolver-fob-kg.js";
import { buildBenchmarkIndex } from "../src/benchmark.js";
import type { LinhaCrua } from "../src/linha.js";

function paraLinhasCruas(parsed: ReturnType<typeof parsePlanilhaRows>): LinhaCrua[] {
  return parsed.linhas.map((l) => ({
    descOriginal: l.descricao,
    ncm: l.ncm,
    qtd: l.qtd,
    qtdCaixas: l.qtdCaixas ?? null,
    qtdPorCaixa: l.qtdPorCaixa ?? null,
    pesoBrutoKg: l.pesoBrutoKg,
    pesoLiqKg: l.pesoLiqKg,
    fobUnitarioUS: l.precoUnitario,
    fobTotalUS: l.fobTotalUS,
    material: l.material ?? null,
    uso: l.uso ?? null,
  }));
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..", "..", "..");

function matrixFatura92Fob(): unknown[][] {
  return [
    ["Modelo", "Descrição", "Material", "Uso", "总数量", "装箱量", "单价USD"],
    ["ES-T19A-10BLK", "滑板车 preto", "高碳钢", "骑行", 500, null, 140.58],
    ["ES-T19A-10WHI", "滑板车 branco", "高碳钢", "骑行", 210, null, 140.58],
    ["ACC-ES-SSA001", "减震器 — 711.0", "铁", "配件", 4, null, 0.12],
    ["ACC-ES-BC002", "刹车线", "镀铬钢", "配件", null, 5, 0.05],
    ["ACC-ES-LS001", "螺丝", "铁", "配件", null, 10, 0.001],
    ["ACC-ES-018", "仪表", "PC", "配件", null, 1, 0.1],
    ["ACC-ES-034", "减震螺丝", "铁", "配件", null, 10, 0.01],
    ["ACC-ES-035", "额头螺丝", "铁", "配件", null, 10, 0.01],
    ["ACC-ES-043", "适配器", "塑胶", "配件", null, 1, 0.2],
    ["ACC-ES-042", "控制器 — 712.0", "铝", "配件", 10, null, 0.1],
    ["ACC-ES-045", "刹车把", "铝", "配件", null, 5, 0.1],
    ["ACC-ES-040", "后挡泥板", "PVC", "配件", null, 1, 0.1],
    ["ACC-ES-033", "后挡泥板", "PVC", "配件", null, 1, 0.1],
  ];
}

describe("fatura 92 — FOB linha peças (caixa compartilhada)", () => {
  it("parser + preencherFobKg: peças com fonte linha e FOB em centavos", () => {
    const parsed = parsePlanilhaRows(matrixFatura92Fob(), "fatura-92-fob");
    const index = buildBenchmarkIndex([]);
    const { linhas, metas } = preencherFobKgPlanilha(paraLinhasCruas(parsed), index);

    const pecas = linhas.filter((l) => l.descOriginal.startsWith("ACC-ES"));
    expect(pecas.length).toBe(11);
    for (const p of pecas) {
      expect(p.fobTotalUS ?? 0).toBeGreaterThan(0);
    }

    const idxFreio = linhas.findIndex((l) => l.descOriginal.includes("刹车线"));
    expect(linhas[idxFreio]?.fobTotalUS).toBeCloseTo(0.25, 4);
    expect(metas[idxFreio]?.fobKgFonte).toBe(FOB_KG_FONTE_LINHA);
    expect(linhas[idxFreio]?.avisosQtd?.[0]).toContain("caixa compartilhada");

    const pendentes = metas.filter((m) => m.fobKgFonte === FOB_KG_FONTE_PENDENTE);
    expect(pendentes).toHaveLength(0);
  });

  it("fixture JSON classificar: 0 partes pendentes após preencherFobKg", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/fatura-92-limpa-classificar.json"), "utf8"),
    ) as { linhas: import("../src/linha.js").LinhaCrua[] };
    const index = buildBenchmarkIndex([]);
    const { linhas, metas } = preencherFobKgPlanilha(json.linhas, index);

    const pecas = linhas.filter((l) => /^ACC-ES/i.test(l.descOriginal));
    expect(pecas.every((p) => (p.fobTotalUS ?? 0) > 0)).toBe(true);

    const idxPecas = linhas
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /^ACC-ES/i.test(l.descOriginal));
    for (const { i } of idxPecas) {
      expect(metas[i]?.fobKgFonte).toBe(FOB_KG_FONTE_LINHA);
      expect(metas[i]?.fobPendente).not.toBe(true);
    }
  });
});
