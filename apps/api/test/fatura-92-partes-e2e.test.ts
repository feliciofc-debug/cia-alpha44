import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm, textoClassificacaoIa } from "@cia/pipeline";
import { criarMockProvider } from "../src/llm/mock.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);

describe("fatura 92 — partes com material/uso (item 3e mock)", () => {
  it("减震器 + material 铁 + uso 配件 → NCM 8714xx fonte ia (não Siscomex)", async () => {
    const descOriginal = "减震器 / Shock Absorber";
    const material = "铁";
    const uso = "配件";
    const [classificado] = await mock.classify2Passes!(catalog, [
      { descOriginal, material, uso },
    ]);
    const descricao = textoClassificacaoIa({ descOriginal, material, uso });
    const r = resolveNcm(catalog, {
      candidatosIa: classificado!.ncmCandidatos,
      descricao,
    });
    expect(r.fonte).toBe("ia");
    expect(r.ncm.startsWith("8714")).toBe(true);
    expect(r.ncm.startsWith("8211")).toBe(false);
    expect(r.avisos.some((a) => a.includes("inferido pela tabela Siscomex"))).toBe(false);
  });
});
