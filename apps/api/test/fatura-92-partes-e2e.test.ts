import { describe, it, expect } from "vitest";
import { criarNcmCatalog, loadNcmVigente, resolveNcm, textoClassificacaoIa } from "@cia/pipeline";
import { criarMockProvider } from "../src/llm/mock.js";

const catalog = criarNcmCatalog(loadNcmVigente());
const mock = criarMockProvider([]);

describe("fatura 92 — partes com material/uso (item 3e mock)", () => {
  it("减震器 + material 铁 + uso 配件 → NCM 87141000 fonte ia (não 8708)", async () => {
    const descOriginal = "减震器 Shock Absorber, veículo: patinete elétrico";
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
    expect(r.ncm).toBe("87141000");
    expect(r.ncm.startsWith("8708")).toBe(false);
    expect(r.avisos.some((a) => a.includes("inferido pela tabela Siscomex"))).toBe(false);
  });
});
