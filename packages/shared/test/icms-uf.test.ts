import { describe, expect, it } from "vitest";
import {
  AVISO_REGIME_ICMS_NORMAL,
  FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL,
  ICMS_INTERNO_UF,
  icmsSaidaParaDestino,
  normalizarUf,
  resolverIcmsEfetivo,
} from "../src/icms-uf.js";

describe("icms-uf", () => {
  it("normaliza sigla UF", () => {
    expect(normalizarUf(" sp ")).toBe("SP");
    expect(normalizarUf("XX")).toBeNull();
  });

  it("planilha 66 default — ufEmpresa AL, dest SP, AL_DIFERIDO → saída 4%", () => {
    const r = resolverIcmsEfetivo({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
    });
    expect(r.icmsSaidaEfetivo).toBe(0.04);
    expect(r.icmsEntradaEfetivo).toBe(0);
    expect(r.fundamentoSaida).toBe(FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL);
    expect(r.operacaoInterestadual).toBe(true);
    expect(r.avisoRegimeIcms).toBeUndefined();
  });

  it("operação interna AL — destino = ufEmpresa → alíquota interna", () => {
    const r = resolverIcmsEfetivo({
      ufEmpresa: "AL",
      destino: "AL",
      regimeIcms: "AL_DIFERIDO",
    });
    expect(r.icmsSaidaEfetivo).toBe(ICMS_INTERNO_UF.AL);
    expect(r.fundamentoSaida).toContain("interno");
    expect(r.operacaoInterestadual).toBe(false);
  });

  it("interestadual independe do regime — NORMAL dest SP ufEmpresa AL → 4%", () => {
    const r = resolverIcmsEfetivo({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "NORMAL",
    });
    expect(r.icmsSaidaEfetivo).toBe(0.04);
    expect(r.fundamentoSaida).toBe(FUNDAMENTO_ICMS_SAIDA_INTERESTADUAL);
    expect(r.avisoRegimeIcms).toBe(AVISO_REGIME_ICMS_NORMAL);
    expect(r.icmsEntradaEfetivo).toBe(0);
  });

  it("NORMAL operação interna — ufEmpresa SP, dest SP → 18%", () => {
    const r = resolverIcmsEfetivo({
      ufEmpresa: "SP",
      destino: "SP",
      regimeIcms: "NORMAL",
    });
    expect(r.icmsSaidaEfetivo).toBe(0.18);
    expect(r.avisoRegimeIcms).toBe(AVISO_REGIME_ICMS_NORMAL);
    expect(r.operacaoInterestadual).toBe(false);
  });

  it("benefício fiscal não altera saída interestadual — dest SP sempre 4% com ufEmpresa AL", () => {
    expect(
      resolverIcmsEfetivo({
        ufEmpresa: "AL",
        destino: "SP",
        regimeIcms: "AL_DIFERIDO",
      }).icmsSaidaEfetivo,
    ).toBe(0.04);
  });

  it("icmsSaidaManualFlag — ignora resolver na saída", () => {
    const r = resolverIcmsEfetivo({
      ufEmpresa: "AL",
      destino: "SP",
      regimeIcms: "AL_DIFERIDO",
      icmsSaidaManualFlag: true,
      icmsSaidaManual: 0.12,
    });
    expect(r.icmsSaidaEfetivo).toBe(0.12);
    expect(r.fundamentoSaida).toContain("manual");
  });

  it("icmsSaidaParaDestino legado — AL→SP 4%, AL→AL interno", () => {
    expect(icmsSaidaParaDestino("SP")).toBe(0.04);
    expect(icmsSaidaParaDestino("AL")).toBe(ICMS_INTERNO_UF.AL);
  });
});
