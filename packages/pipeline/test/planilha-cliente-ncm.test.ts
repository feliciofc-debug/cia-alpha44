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
