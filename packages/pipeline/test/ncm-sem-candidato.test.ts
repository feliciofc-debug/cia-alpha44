import { describe, expect, it } from "vitest";
import {
  criarNcmCatalog,
  loadNcmVigente,
  montarCandidatosPasse1,
  resolveNcm,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

/** Idioma inventado — zero match textual possível na NCM Siscomex. */
const DESCRICAO_INVENTADA =
  "Xylophar quendrix moltava zephyr kranix blorpt fenwick glimtosh vornax";

describe("P2a — sem NCM arbitrário", () => {
  it("montarCandidatosPasse1 retorna vazio para idioma inventado", () => {
    const cands = montarCandidatosPasse1(catalog, DESCRICAO_INVENTADA);
    expect(cands).toHaveLength(0);
  });

  it("resolveNcm sem planilha nem IA → pendente, nunca 01012100 (cavalos)", () => {
    const r = resolveNcm(catalog, {
      descricao: DESCRICAO_INVENTADA,
      descOriginal: DESCRICAO_INVENTADA,
      candidatosIa: [],
    });
    expect(r.ncm).toBe("");
    expect(r.fonte).toBe("pendente");
    expect(r.valido).toBe(false);
    expect(r.ncm).not.toBe("01012100");
    expect(r.avisos.some((a) => /classificação pendente/i.test(a))).toBe(true);
  });

  it("rejeita candidato IA com confiança baixa (< 0,6)", () => {
    const r = resolveNcm(catalog, {
      descricao: DESCRICAO_INVENTADA,
      descOriginal: DESCRICAO_INVENTADA,
      candidatosIa: [{ ncm: "01012100", confianca: 0.45 }],
    });
    expect(r.ncm).not.toBe("01012100");
    expect(r.fonte).toBe("pendente");
  });
});
