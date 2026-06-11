import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm } from "@cia/pipeline";
import { criarMockProvider } from "../src/llm/mock.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);

/** Linhas-chave da fatura-92-limpa (mock E2E). */
const LINHAS = {
  patinete: {
    descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX 10寸500W款（黑色）",
    material: "高碳钢",
    uso: "骑行",
  },
  amortecedor: { descOriginal: "ACC-ES-SSA001 — 减震器", material: "铁", uso: "配件" },
  parafuso: { descOriginal: "ACC-ES-LS001 — 后尾挡泥板螺丝", material: "铁", uso: "配件" },
  adaptador: { descOriginal: "ACC-ES-043 — 适配器", material: "塑胶", uso: "配件" },
} as const;

describe("fatura 92 limpa — mock E2E (regressão patinetes/partes)", () => {
  it("patinete 滑板车 + uso 骑行 → 87116000 fonte ia", async () => {
    const [c] = await mock.classify2Passes!(catalog, [LINHAS.patinete]);
    const r = resolveNcm(catalog, {
      descOriginal: LINHAS.patinete.descOriginal,
      uso: LINHAS.patinete.uso,
      candidatosIa: c!.ncmCandidatos,
    });
    expect(r.ncm).toBe("87116000");
    expect(r.fonte).toBe("ia");
    expect(r.ncm.startsWith("7326")).toBe(false);
  });

  it("parafuso 螺丝 → 7318xx fonte ia", async () => {
    const [c] = await mock.classify2Passes!(catalog, [LINHAS.parafuso]);
    const r = resolveNcm(catalog, {
      descOriginal: LINHAS.parafuso.descOriginal,
      uso: LINHAS.parafuso.uso,
      candidatosIa: c!.ncmCandidatos,
    });
    expect(r.ncm.startsWith("7318")).toBe(true);
    expect(r.fonte).toBe("ia");
  });

  it("adaptador 适配器 → 8504xx fonte ia", async () => {
    const [c] = await mock.classify2Passes!(catalog, [LINHAS.adaptador]);
    const r = resolveNcm(catalog, {
      descOriginal: LINHAS.adaptador.descOriginal,
      uso: LINHAS.adaptador.uso,
      candidatosIa: c!.ncmCandidatos,
    });
    expect(r.ncm.startsWith("8504")).toBe(true);
    expect(r.fonte).toBe("ia");
  });

  it("amortecedor → 8714xx (não 8708)", async () => {
    const [c] = await mock.classify2Passes!(catalog, [LINHAS.amortecedor]);
    const r = resolveNcm(catalog, {
      descOriginal: LINHAS.amortecedor.descOriginal,
      uso: LINHAS.amortecedor.uso,
      candidatosIa: c!.ncmCandidatos,
    });
    expect(r.ncm.startsWith("8714")).toBe(true);
    expect(r.ncm.startsWith("8708")).toBe(false);
    expect(r.fonte).toBe("ia");
  });
});
