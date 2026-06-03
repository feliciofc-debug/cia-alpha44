import { describe, it, expect } from "vitest";
import {
  parseRows,
  buildBenchmarkIndex,
  lookupBenchmark,
  loadComexSeed,
  calibrarFobKg,
  analisarRisco,
} from "../src/index.js";

describe("Parser de planilha de fornecedor", () => {
  it("detecta colunas com cabeçalho misto EN/中文", () => {
    const rows: unknown[][] = [
      ["PACKING LIST", null, null, null, null],
      ["Product Description", "HS Code", "Qty", "Net Weight", "Unit Price"],
      ["LED Light 30W", "94052100", "100", "1278", "19.17"],
      ["Garden chair 花园椅", "94032000", "50", "663", "39.78"],
      [null, null, null, null, null],
    ];
    const r = parseRows(rows);
    expect(r.headerRowIndex).toBe(1);
    expect(r.mapeamento.descricao).toBe(0);
    expect(r.mapeamento.ncm).toBe(1);
    expect(r.mapeamento.qtd).toBe(2);
    expect(r.mapeamento.pesoLiq).toBe(3);
    expect(r.mapeamento.fobUnit).toBe(4);
    expect(r.totalLinhas).toBe(2);
    expect(r.linhas[0]!.ncm).toBe("94052100");
    expect(r.linhas[0]!.pesoLiqKg).toBe(1278);
    // FOB total derivado de unit * qtd
    expect(r.linhas[0]!.fobTotalUS).toBeCloseTo(1917, 2);
  });

  it("detecta cabeçalho em chinês", () => {
    const rows: unknown[][] = [
      ["品名", "数量", "净重", "单价"],
      ["不锈钢螺丝", "200", "471", "4.0"],
    ];
    const r = parseRows(rows);
    expect(r.mapeamento.descricao).toBe(0);
    expect(r.mapeamento.qtd).toBe(1);
    expect(r.mapeamento.pesoLiq).toBe(2);
    expect(r.mapeamento.fobUnit).toBe(3);
  });
});

describe("Benchmark ComexStat (seed real)", () => {
  const seed = loadComexSeed();
  const index = buildBenchmarkIndex(seed.itens);

  it("carrega o seed com milhares de NCMs", () => {
    expect(seed.itens.length).toBeGreaterThan(5000);
  });

  it("encontra um NCM existente e marca fonte ComexStat", () => {
    const b = lookupBenchmark(index, "0304.71.00");
    expect(b.fonte).toBe("ComexStat");
    expect(b.mediaFobKg).toBeGreaterThan(0);
    expect(b.pisoDefensavel).toBeLessThan(b.mediaFobKg!);
  });

  it("NCM inexistente → sem base (não finge validação)", () => {
    const b = lookupBenchmark(index, "00000000");
    expect(b.fonte).toBe("sem base");
    expect(b.mediaFobKg).toBeNull();
  });

  it("histórico próprio tem prioridade sobre ComexStat", () => {
    const b = lookupBenchmark(index, "0304.71.00", { mediaFobKg: 9.5, amostra: 3 });
    expect(b.fonte).toBe("Histórico próprio");
    expect(b.mediaFobKg).toBe(9.5);
  });
});

describe("Calibrador FOB/KG", () => {
  const benchmark = {
    fonte: "ComexStat" as const,
    mediaFobKg: 10,
    pisoDefensavel: 8,
    teto: null,
    amostra: 30,
    nota: "",
  };

  it("FOB abaixo do piso é elevado ao alvo defensável", () => {
    const c = calibrarFobKg({ fobKgOriginal: 5, benchmark });
    expect(c.ajustado).toBe(true);
    expect(c.fobKgCalibrado).toBe(8);
  });

  it("FOB já defensável é mantido", () => {
    const c = calibrarFobKg({ fobKgOriginal: 9, benchmark });
    expect(c.ajustado).toBe(false);
    expect(c.fobKgCalibrado).toBe(9);
  });

  it("sem benchmark mantém o original sem fingir validação", () => {
    const semBase = { ...benchmark, fonte: "sem base" as const, mediaFobKg: null, pisoDefensavel: null };
    const c = calibrarFobKg({ fobKgOriginal: 7, benchmark: semBase });
    expect(c.ajustado).toBe(false);
    expect(c.desvioBenchmarkPct).toBeNull();
  });
});

describe("Análise de risco / canal", () => {
  const benchmark = {
    fonte: "ComexStat" as const,
    mediaFobKg: 10,
    pisoDefensavel: 8,
    teto: null,
    amostra: 30,
    nota: "",
  };
  const calOk = { fobKgOriginal: 9, fobKgCalibrado: 9, desvioBenchmarkPct: -10, ajustado: false, justificativa: "" };

  it("FOB coerente → verde", () => {
    const r = analisarRisco({ benchmark, calibracao: calOk, fobKgFinal: 9 });
    expect(r.canal).toBe("VERDE_PROVAVEL");
  });

  it("FOB abaixo do piso → cinza/valoração", () => {
    const r = analisarRisco({ benchmark, calibracao: calOk, fobKgFinal: 5 });
    expect(r.canal).toBe("CINZA_VALORACAO");
  });

  it("anuência → pelo menos amarelo técnico", () => {
    const r = analisarRisco({ benchmark, calibracao: calOk, fobKgFinal: 9, anuencia: ["ANATEL"] });
    expect(["AMARELO_TECNICO", "VERMELHO_TECNICO"]).toContain(r.canal);
  });

  it("antidumping → vermelho técnico", () => {
    const r = analisarRisco({ benchmark, calibracao: calOk, fobKgFinal: 9, antidumping: true });
    expect(r.canal).toBe("VERMELHO_TECNICO");
  });
});
