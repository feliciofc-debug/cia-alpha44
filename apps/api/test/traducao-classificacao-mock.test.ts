import { describe, expect, it } from "vitest";
import { resolverDescPtFornecedor } from "@cia/pipeline";
import { traduzirDescricaoClassificacaoMock } from "../src/llm/traducao-classificacao-mock.js";

describe("traducao-classificacao-mock", () => {
  it("traduz descrições chinesas puras do arquivo de patinete sem duplicar como modelo", () => {
    const patinete = resolverDescPtFornecedor(
      "电动滑板车",
      traduzirDescricaoClassificacaoMock("电动滑板车"),
    );
    const bateria = resolverDescPtFornecedor("电池", traduzirDescricaoClassificacaoMock("电池"));

    expect(patinete.descPt).toBe("Patinete elétrico");
    expect(bateria.descPt).toBe("Bateria");
  });
});
