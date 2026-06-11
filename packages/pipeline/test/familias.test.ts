import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FAMILIAS_PRODUTO,
  criarNcmCatalog,
  detectarFamilia,
  detectarFamilias,
  loadNcmVigente,
  montarCandidatosPasse1,
  ncmCoerenteComFamilia,
  ncmCoerenteComPrefixo,
  prefixosDasFamilias,
  resolveNcm,
} from "../src/index.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

interface FixtureItem {
  descricao: string;
  familiaEsperada: string;
  prefixosEsperados: string[];
  ncmPlanilha?: string;
}

function loadFixture(nome: string): { fonte: string; itens: FixtureItem[] } {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, nome), "utf8")) as {
    fonte: string;
    itens: FixtureItem[];
  };
}

describe("familias — catálogo", () => {
  it("tem ~30 famílias com prefixos 2 ou 4 dígitos", () => {
    expect(FAMILIAS_PRODUTO.length).toBeGreaterThanOrEqual(28);
    expect(FAMILIAS_PRODUTO.length).toBeLessThanOrEqual(35);
    for (const f of FAMILIAS_PRODUTO) {
      expect(f.prefixos.length).toBeGreaterThan(0);
      for (const p of f.prefixos) {
        expect(p.replace(/\D/g, "").length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("iluminacao usa posição única 9405", () => {
    const f = FAMILIAS_PRODUTO.find((x) => x.id === "iluminacao");
    expect(f?.prefixos).toEqual(["9405"]);
  });

  it("moveis_assentos e moveis_outros têm prefixos distintos", () => {
    const ass = FAMILIAS_PRODUTO.find((x) => x.id === "moveis_assentos");
    const out = FAMILIAS_PRODUTO.find((x) => x.id === "moveis_outros");
    expect(ass?.prefixos).toContain("9401");
    expect(out?.prefixos).toContain("9403");
  });
});

describe("familias — coerência por prefixo", () => {
  it("ncmCoerenteComPrefixo aceita capítulo 2 dígitos e posição 4", () => {
    expect(ncmCoerenteComPrefixo("94052100", "9405")).toBe(true);
    expect(ncmCoerenteComPrefixo("94052100", "94")).toBe(true);
    expect(ncmCoerenteComPrefixo("94052100", "8518")).toBe(false);
  });

  it("família com múltiplos prefixos — NCM válido se bater qualquer um", () => {
    const cam = FAMILIAS_PRODUTO.find((f) => f.id === "cameras")!;
    expect(ncmCoerenteComFamilia("85258929", cam)).toBe(true);
    expect(ncmCoerenteComFamilia("85258019", cam)).toBe(true);
  });
});

describe("familias — brinquedos × patinete elétrico", () => {
  it("patinete infantil → brinquedos (9503)", () => {
    const r = detectarFamilias("patinete infantil para criança");
    expect(r.conflito).toBe(false);
    expect(r.familias.map((f) => f.familia.id)).toContain("brinquedos");
    expect(r.familias.map((f) => f.familia.id)).not.toContain("veiculo_leve_eletrico");
    expect(r.familias[0]!.familia.prefixos).toContain("9503");
  });

  it("patinete elétrico 350W → veículo leve (8711), não brinquedos", () => {
    const r = detectarFamilias("patinete elétrico 350W adulto");
    expect(r.familias.map((f) => f.familia.id)).toContain("veiculo_leve_eletrico");
    expect(r.familias.map((f) => f.familia.id)).not.toContain("brinquedos");
    expect(r.familias.find((f) => f.familia.id === "veiculo_leve_eletrico")!.familia.prefixos).toContain(
      "8711",
    );
  });

  it("electric scooter → 8711 sem conflito com brinquedos", () => {
    const r = detectarFamilias("electric scooter 500W");
    expect(r.conflito).toBe(false);
    expect(detectarFamilia("electric scooter 500W")?.id).toBe("veiculo_leve_eletrico");
  });

  it("滑板车 ZH → veiculo_leve_eletrico (8711)", () => {
    const r = detectarFamilias("滑板车T1 MAX 10寸500W款");
    expect(r.familias.map((f) => f.familia.id)).toContain("veiculo_leve_eletrico");
  });

  it("uso 骑行 viés produto completo — exclui metal_ferro_aco e pecas", () => {
    const r = detectarFamilias({
      descOriginal: "滑板车T1 MAX 10寸500W款",
      uso: "骑行",
    });
    expect(r.familias.map((f) => f.familia.id)).toContain("veiculo_leve_eletrico");
    expect(r.familias.map((f) => f.familia.id)).not.toContain("metal_ferro_aco");
    expect(r.familias.map((f) => f.familia.id)).not.toContain("pecas_veiculo_leve");
  });

  it("material não participa da detecção — 高碳钢 só no prompt, não na família", () => {
    const soDesc = detectarFamilias({ descOriginal: "滑板车T1 MAX", uso: "骑行" });
    const descComMaterial = detectarFamilias("滑板车 · Material: 高碳钢");
    expect(soDesc.familias.map((f) => f.familia.id)).not.toContain("metal_ferro_aco");
    expect(descComMaterial.familias.map((f) => f.familia.id)).toContain("metal_ferro_aco");
  });

  it("uso 配件 viés parte — inclui pecas, exclui veiculo completo", () => {
    const r = detectarFamilias({ descOriginal: "减震器", uso: "配件" });
    expect(r.familias.map((f) => f.familia.id)).toContain("pecas_veiculo_leve");
    expect(r.familias.map((f) => f.familia.id)).not.toContain("veiculo_leve_eletrico");
  });
});

describe("familias — conflito", () => {
  it("descrição ambígua dispara 2+ famílias e aviso", () => {
    const r = detectarFamilias("Lustre toy LED gift for kids chandelier");
    expect(r.familias.length).toBeGreaterThanOrEqual(2);
    expect(r.conflito).toBe(true);
    expect(r.avisoConflito).toMatch(/Famílias conflitantes/i);
    expect(detectarFamilia("Lustre toy LED gift for kids chandelier")).toBeNull();
  });

  it("conflito inclui múltiplos capítulos nos candidatos passe 1", () => {
    const cands = montarCandidatosPasse1(catalog, "Lustre toy LED gift for kids chandelier");
    const caps = new Set(cands.map((c) => c.posicao4.slice(0, 2)));
    expect(caps.size).toBeGreaterThanOrEqual(2);
  });
});

describe("familias — fixture fatura 16 (27 lustres)", () => {
  const fx = loadFixture("descricoes-fatura-16.json");

  it("todas as descrições disparam iluminacao / prefixo 9405", () => {
    expect(fx.itens.length).toBe(27);
    for (const item of fx.itens) {
      const fam = detectarFamilia(item.descricao);
      expect(fam?.id, item.descricao).toBe("iluminacao");
      expect(fam?.prefixos, item.descricao).toContain("9405");
    }
  });

  it("NCM-8 gabarito: resolve 94051093 inválido mantém prefixo 9405", () => {
    for (const item of fx.itens.filter((i) => i.ncmPlanilha === "94051093").slice(0, 3)) {
      const r = resolveNcm(catalog, {
        ncmPlanilha: item.ncmPlanilha,
        descricao: item.descricao,
      });
      expect(r.valido).toBe(true);
      expect(r.ncm.startsWith("9405")).toBe(true);
    }
  });

  it("NCM planilha 94051190 vigente permanece no prefixo 9405", () => {
    const item = fx.itens.find((i) => i.ncmPlanilha === "94051190")!;
    const r = resolveNcm(catalog, {
      ncmPlanilha: item.ncmPlanilha,
      descricao: item.descricao,
    });
    expect(r.ncm).toBe("94051190");
    expect(r.ncm.startsWith("9405")).toBe(true);
  });
});

describe("familias — fixture cotação 92 (só família/prefixo)", () => {
  const fx = loadFixture("descricoes-cotacao-92.json");

  for (const item of loadFixture("descricoes-cotacao-92.json").itens) {
    it(`${item.descricao.slice(0, 40)} → ${item.familiaEsperada}`, () => {
      const r = detectarFamilias(item.descricao);
      const ids = r.familias.map((f) => f.familia.id);
      expect(ids, item.descricao).toContain(item.familiaEsperada);
      const prefixos = prefixosDasFamilias(
        r.familias.filter((f) => f.familia.id === item.familiaEsperada).map((f) => f.familia),
      );
      for (const esperado of item.prefixosEsperados) {
        expect(prefixos.some((p) => p.startsWith(esperado) || esperado.startsWith(p)), item.descricao).toBe(
          true,
        );
      }
    });
  }

  it("fixture cotação 92 não exige NCM-8", () => {
    expect(fx.itens.every((i) => !("ncmEsperado" in i))).toBe(true);
  });
});

describe("familias — guard-rail não decide NCM-8", () => {
  it("montarCandidatosPasse1 inclui posição da família mas não fixa NCM-8", () => {
    const cands = montarCandidatosPasse1(catalog, "Garrafa térmica inox 500ml");
    expect(cands.some((c) => c.posicao4 === "9617")).toBe(true);
    expect(cands.length).toBeGreaterThan(1);
  });
});
