import { describe, expect, it } from "vitest";
import { criarNcmCatalog, loadNcmVigente, type NcmVigenteCache } from "../src/ncm-catalog.js";

/** Fixture mínima — ramo 9405 com folha genérica "Outros" e ancestrais descritivos. */
const FIXTURE: NcmVigenteCache = {
  fonte: "fixture-teste",
  dataUltimaAtualizacao: null,
  total: 3,
  itens: {
    "94051190": {
      folha: "Luminárias e aparelhos de iluminação, incluídos os projetores, e suas partes",
      completa:
        "Móveis; mobiliário médico-cirúrgico > Luminárias e aparelhos de iluminação > " +
        "Lustres e outros aparelhos de iluminação, elétricos, para teto ou parede > " +
        "Luminárias e aparelhos de iluminação, incluídos os projetores, e suas partes",
    },
    "94051900": {
      folha: "Outros",
      completa:
        "Móveis; mobiliário médico-cirúrgico > Luminárias e aparelhos de iluminação > " +
        "Lustres e outros aparelhos de iluminação, elétricos, para teto ou parede > Outros",
    },
    "85044021": {
      folha: "Outros",
      completa:
        "Máquinas, aparelhos e materiais elétricos > Transformadores elétricos > " +
        "Com potência não superior a 1 kVA > Outros",
    },
  },
};

describe("ncm-catalog hierárquico", () => {
  it("descricao retorna folha e descricaoCompleta retorna caminho", () => {
    const cat = criarNcmCatalog(FIXTURE);
    expect(cat.descricao("94051190")).toBe(
      "Luminárias e aparelhos de iluminação, incluídos os projetores, e suas partes",
    );
    expect(cat.descricaoCompleta("94051190")).toContain("Lustres e outros aparelhos");
    expect(cat.descricaoCompleta("94051190")).toContain("Móveis; mobiliário");
  });

  it("aceita entrada legada string", () => {
    const cat = criarNcmCatalog({
      fonte: "legado",
      dataUltimaAtualizacao: null,
      total: 1,
      itens: { "12345678": "Descrição única" },
    });
    expect(cat.descricao("12345678")).toBe("Descrição única");
    expect(cat.descricaoCompleta("12345678")).toBe("Descrição única");
  });

  it('buscarPorTexto("lustre LED") retorna 9405xxxx no topo', () => {
    const cat = criarNcmCatalog(FIXTURE);
    const hits = cat.buscarPorTexto("lustre LED", undefined, 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.ncm.startsWith("9405")).toBe(true);
  });

  it('encontra NCM com folha "Outros" pelo texto do ancestral', () => {
    const cat = criarNcmCatalog(FIXTURE);
    const hits = cat.buscarPorTexto("luminária", undefined, 10);
    const outros = hits.find((h) => h.ncm === "94051900");
    expect(outros).toBeDefined();
    expect(outros!.descricao).toBe("Outros");
    expect(outros!.score).toBeGreaterThan(0);
  });
});

describe("ncm-catalog catálogo real", () => {
  it("94051190 existe com descrição completa hierárquica", () => {
    const cat = criarNcmCatalog(loadNcmVigente());
    expect(cat.existe("94051190")).toBe(true);
    const completa = cat.descricaoCompleta("94051190");
    expect(completa).toBeTruthy();
    expect(completa!.split(" > ").length).toBeGreaterThan(1);
  });
});
