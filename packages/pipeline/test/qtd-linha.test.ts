import { describe, it, expect } from "vitest";
import {
  AVISO_QTD_CAIXA_COMPARTILHADA,
  extrairCaixaCompartilhadaDesc,
  extrairQuantidadeIntervaloDesc,
  resolverQuantidadesPlanilha,
  aplicarQuantidadesLinhas,
} from "../src/qtd-linha.js";

describe("qtd-linha — caixa compartilhada", () => {
  it("extrai caixa 711/712 do fim da descrição", () => {
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-SSA001 — 减震器 — 711.0")).toBe("711");
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-042 — 控制器 — 712.0")).toBe("712");
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-BC002 — 刹车线")).toBeNull();
    expect(extrairQuantidadeIntervaloDesc("ES-T19 — 滑板车 — 1-500")).toBe(500);
    expect(extrairQuantidadeIntervaloDesc("ES-T19 — 滑板车 — 501-710")).toBe(210);
    expect(extrairQuantidadeIntervaloDesc("ACC-ES-SSA001 — 减震器 — 711.0")).toBeNull();
  });

  it("intervalo explícito na descrição prevalece sobre qtd de caixas menor", () => {
    const out = aplicarQuantidadesLinhas([
      {
        descricao: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色） — 1-500",
        qtdCaixas: 2,
        qtdPorCaixa: 1,
        fobUnitarioUS: 109,
      },
      {
        descricao: "ES-T19A-10WHI — 滑板车T1 MAX 10寸500W款（白色） — 501-710",
        qtd: 2,
        fobUnitarioUS: 109,
      },
    ]);
    expect(out[0]!.qtd).toBe(500);
    expect(out[0]!.fobTotalUS).toBe(54500);
    expect(out[0]!.avisosQtd[0]).toMatch(/intervalo/);
    expect(out[1]!.qtd).toBe(210);
    expect(out[1]!.fobTotalUS).toBe(22890);
  });

  it("ordem (1) qtd total e (2) caixas×por-caixa", () => {
    expect(resolverQuantidadesPlanilha([{ descricao: "X", qtd: 500 }])[0]!.qtd).toBe(500);
    expect(
      resolverQuantidadesPlanilha([{ descricao: "X", qtdCaixas: 2, qtdPorCaixa: 3 }])[0]!.qtd,
    ).toBe(6);
  });

  it("não inventa qtd só com qtdPorCaixa sem caixa identificada", () => {
    const [r] = resolverQuantidadesPlanilha([
      { descricao: "ACC-ES-BC002 — 刹车线", uso: "配件", qtdPorCaixa: 5 },
    ]);
    expect(r!.qtd).toBeNull();
    expect(r!.avisosQtd).toHaveLength(0);
  });

  it("caixa 711: qtdPorCaixa após linha âncora com qtd total", () => {
    const linhas = [
      { descricao: "ACC-ES-SSA001 — 减震器 — 711.0", uso: "配件", qtd: 4 },
      { descricao: "ACC-ES-BC002 — 刹车线", uso: "配件", qtdPorCaixa: 5, fobUnitarioUS: 0.05 },
    ];
    const out = aplicarQuantidadesLinhas(linhas);
    expect(out[1]!.qtd).toBe(5);
    expect(out[1]!.fobTotalUS).toBeCloseTo(0.25, 4);
    expect(out[1]!.avisosQtd[0]).toContain(AVISO_QTD_CAIXA_COMPARTILHADA);
  });

  it("nunca assume 1 caixa por default", () => {
    const [r] = resolverQuantidadesPlanilha([
      { descricao: "ACC-ES-X — peça", uso: "配件", qtdPorCaixa: 5, qtdCaixas: null },
    ]);
    expect(r!.qtd).toBeNull();
  });

  it("VPE na descrição (DE)", () => {
    const [r] = resolverQuantidadesPlanilha([
      {
        descricao: "DE-AT-6002 — Sechskantschrauben M8x40 verzinkt, VPE 100",
        uso: "Befestigung",
        qtdCaixas: 0,
        fobUnitarioUS: 0.018,
      },
    ]);
    expect(r!.qtd).toBe(100);
    expect(r!.avisosQtd[0]).toMatch(/VPE 100/);
  });

  it("Sammelkarton global (DE) — Ersatzteil qtd=1", () => {
    const [r] = resolverQuantidadesPlanilha([
      {
        descricao: "DE-AT-6001 — Stoßdämpfer hinten, Ersatzteil",
        uso: "Ersatzteil",
        qtdCaixas: 0,
        fobUnitarioUS: 0.95,
        sammelkarton: "999",
      },
    ]);
    expect(r!.qtd).toBe(1);
    expect(r!.avisosQtd[0]).toMatch(/Sammelkarton 999/);
  });
});
