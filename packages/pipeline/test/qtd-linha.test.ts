import { describe, it, expect } from "vitest";
import {
  AVISO_QTD_CAIXA_COMPARTILHADA,
  extrairCaixaCompartilhadaDesc,
  resolverQuantidadesPlanilha,
  aplicarQuantidadesLinhas,
} from "../src/qtd-linha.js";

describe("qtd-linha — caixa compartilhada", () => {
  it("extrai caixa 711/712 do fim da descrição", () => {
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-SSA001 — 减震器 — 711.0")).toBe("711");
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-042 — 控制器 — 712.0")).toBe("712");
    expect(extrairCaixaCompartilhadaDesc("ACC-ES-BC002 — 刹车线")).toBeNull();
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
});
