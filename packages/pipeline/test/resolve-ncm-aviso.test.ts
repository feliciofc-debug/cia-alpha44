import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm } from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("resolveNcm — aviso guard-rail patinetes (item 3d)", () => {
  it("planilha 87116000 + candidato IA alternativo → mensagem clara", () => {
    const r = resolveNcm(catalog, {
      ncmPlanilha: "87116000",
      descricao: "Patinete elétrico 350W",
      candidatosIa: [{ ncm: "95030099", confianca: 0.9 }],
    });
    expect(r.ncm).toBe("87116000");
    expect(r.fonte).toBe("planilha");
    expect(
      r.avisos.some((a) =>
        a.includes("Candidato alternativo da IA (95030099) descartado pelo guard-rail"),
      ),
    ).toBe(true);
  });
});
