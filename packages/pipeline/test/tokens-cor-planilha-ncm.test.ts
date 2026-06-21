import { describe, it, expect } from "vitest";
import { tokenCorOuAcabamento, tokensProdutoSemCor } from "../src/tokens-cor-produto.js";
import { buscarNcmPlanilhaChinaPorDescricao, carregarItensPlanilhaChinaOperacional } from "../src/planilha-china-ncm.js";
import { detectarFamilia } from "../src/classificar-ncm.js";

describe("tokens-cor-produto", () => {
  it("remove tokens de cor da busca", () => {
    expect(tokenCorOuAcabamento("preta")).toBe(true);
    expect(tokenCorOuAcabamento("pipoqueira")).toBe(false);
    const t = tokensProdutoSemCor("HY-5110 Pipoqueira Preta 220V");
    expect(t).toContain("pipoqueira");
    expect(t).not.toContain("preta");
  });
});

describe("buscarNcmPlanilhaChinaPorDescricao — família prevalece sobre cor", () => {
  const planilha = carregarItensPlanilhaChinaOperacional();

  it("pipoqueira preta não retorna tinta 32151100", () => {
    const fam = detectarFamilia({ descOriginal: "HY-5110 Pipoqueira Preta 220V" });
    expect(fam?.id).toBe("eletrodomesticos");
    const hits = buscarNcmPlanilhaChinaPorDescricao("HY-5110 Pipoqueira Preta 220V", planilha, {
      familia: fam,
      limite: 5,
    });
    expect(hits.some((h) => h.ncm === "32151100")).toBe(false);
    expect(hits[0]?.ncm.startsWith("8516")).toBe(true);
  });
});
