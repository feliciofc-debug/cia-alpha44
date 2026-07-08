import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolverNcmDeclaradoCliente, resolverNcmHerancaFamiliaFatura } from "../src/index.js";
import { resolveNcm } from "../src/resolve-ncm.js";

const catalog = criarNcmCatalog(loadNcmVigente());

describe("planilha-cliente-ncm", () => {
  it("resolverNcmDeclaradoCliente aceita NCM válido e coerente", () => {
    const linha = {
      descOriginal: "HY-97;挂钩秤;Balança de gancho portátil",
      ncm: "84238900",
      qtd: 3100,
    };
    const hit = resolverNcmDeclaradoCliente({ ncmInformado: "84238900" }, linha, catalog);
    expect(hit?.provedor).toBe("planilha-cliente");
    expect(hit?.ncm).toBe("84238900");
    expect(hit?.confianca).toBe(0.95);
  });

  it("resolve código aduaneiro chinês de 10 dígitos pela âncora HS6", () => {
    const linha = {
      descOriginal: "健腹轮 — Roda abdominal para ginástica fitness",
      ncm: "9506919000",
      qtd: 500,
    };
    const hit = resolverNcmDeclaradoCliente({ ncmInformado: "9506919000.0" }, linha, catalog);
    expect(hit?.provedor).toBe("planilha-cliente-hs6");
    expect(hit?.hs6).toBe("950691");
    expect(hit?.ncm).toBe("95069100");
  });

  it("usa residual do HS6 quando há vários NCMs e código de 8 dígitos inválido", () => {
    const linha = {
      descOriginal: "钢化玻璃膜 — Película de vidro protetora",
      ncm: "70200099",
      qtd: 375,
    };
    const hit = resolverNcmDeclaradoCliente({ ncmInformado: "70200099" }, linha, catalog);
    expect(hit?.provedor).toBe("planilha-cliente-hs6");
    expect(hit?.hs6).toBe("702000");
    expect(hit?.ncm).toBe("70200090");
  });

  it("resolverNcmHerancaFamiliaFatura herda de linha com NCM na mesma família", () => {
    const linhas = [
      {
        descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W",
        ncm: "87116000",
        uso: "骑行",
        qtd: 500,
      },
      {
        descOriginal: "ES-T19A-10WHI — 滑板车T1 MAX 10寸500W 白色",
        uso: "骑行",
        qtd: 210,
      },
    ];
    const hit = resolverNcmHerancaFamiliaFatura(linhas[1]!, linhas, catalog, 1);
    expect(hit?.provedor).toBe("planilha-cliente-familia");
    expect(hit?.ncm).toBe("87116000");
  });

  it("resolveNcm respeita fonte planilha-cliente", () => {
    const r = resolveNcm(catalog, {
      fonteClassificacao: "planilha-cliente",
      candidatosIa: [{ ncm: "87116000", confianca: 0.95 }],
      descOriginal: "Patinete elétrico",
    });
    expect(r.fonte).toBe("planilha-cliente");
    expect(r.ncm).toBe("87116000");
  });
});
