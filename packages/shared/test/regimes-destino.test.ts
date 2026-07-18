import { describe, expect, it } from "vitest";
import {
  listarOpcoesDestino,
  parseDestinoSelecao,
  presetRegimeDestino,
  resolverParamsRegimeDestino,
} from "../src/regimes-destino.js";

describe("regimes-destino", () => {
  it("lista estados + regimes especiais", () => {
    const opcoes = listarOpcoesDestino();
    expect(opcoes.length).toBeGreaterThan(27);
    expect(opcoes.some((o) => o.value === "SC_TTD_FASE1")).toBe(true);
    expect(opcoes.some((o) => o.value === "AL")).toBe(true);
  });

  it("parse SC TTD fase 1", () => {
    const p = parseDestinoSelecao("SC_TTD_FASE1");
    expect(p.destino).toBe("SC");
    expect(p.regimeDestinoId).toBe("SC_TTD_FASE1");
  });

  it("parse UF integral", () => {
    const p = parseDestinoSelecao("RJ");
    expect(p.destino).toBe("RJ");
    expect(p.regimeDestinoId).toBeNull();
  });

  it("preset SC TTD fase 1 — parâmetros default", () => {
    const preset = presetRegimeDestino("SC_TTD_FASE1");
    expect(preset?.icmsImportacaoAliq).toBe(0.026);
    expect(preset?.icmsSaidaEfetivaAliq).toBe(0.026);
    expect(preset?.aliqFundos).toBe(0.004);
    const params = resolverParamsRegimeDestino("SC_TTD_FASE1", null);
    expect(params?.icmsImportacaoAliq).toBe(0.026);
  });
});
