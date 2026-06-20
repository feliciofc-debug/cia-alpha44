import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { criarNcmCatalog, loadNcmVigente } from "@cia/pipeline";
import {
  classificarItensGeminiLote,
  geminiClassificacaoHabilitada,
} from "../src/llm/classificar-gemini-lovable.js";

const catalog = criarNcmCatalog(loadNcmVigente());

vi.mock("../src/services/ncm-helper.js", () => ({
  sugerirNcm: vi.fn(),
}));

import { sugerirNcm } from "../src/services/ncm-helper.js";

const sugerirMock = vi.mocked(sugerirNcm);

describe("classificar-gemini-lovable", () => {
  const envBackup = process.env.CLASSIFICACAO_NCM_PROVIDER;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLASSIFICACAO_NCM_PROVIDER = "gemini";
  });

  afterEach(() => {
    if (envBackup === undefined) delete process.env.CLASSIFICACAO_NCM_PROVIDER;
    else process.env.CLASSIFICACAO_NCM_PROVIDER = envBackup;
  });

  it("geminiClassificacaoHabilitada respeita CLASSIFICACAO_NCM_PROVIDER", () => {
    expect(geminiClassificacaoHabilitada()).toBe(true);
    process.env.CLASSIFICACAO_NCM_PROVIDER = "legacy";
    expect(geminiClassificacaoHabilitada()).toBe(false);
  });

  it("classificarItensGeminiLote mapeia sugestão Lovable", async () => {
    sugerirMock.mockResolvedValue({
      ok: true,
      sugestao: {
        ncm: "84798999",
        confianca: 0.91,
        descricaoOficial: "Outras máquinas e aparelhos mecânicos",
        justificativaRGI: "RGI 1",
      },
      alternativas: [{ ncm: "84732910", descricaoOficial: "Outras" }],
    });

    const [r] = await classificarItensGeminiLote(
      [{ descOriginal: "Massageador elétrico" }],
      catalog,
      1,
    );

    expect(r!.ok).toBe(true);
    expect(r!.output.classificacaoProvedor).toBe("gemini");
    expect(r!.output.ncmCandidatos[0]!.ncm).toBe("84798999");
    expect(sugerirMock).toHaveBeenCalledTimes(1);
  });

  it("classificarItensGeminiLote ok=false quando Lovable falha", async () => {
    sugerirMock.mockResolvedValue({ ok: false, erro: "timeout" });

    const [r] = await classificarItensGeminiLote(
      [{ descOriginal: "Air fryer" }],
      catalog,
      1,
    );

    expect(r!.ok).toBe(false);
    expect(r!.output.classificacaoProvedor).toBe("gemini");
    expect(r!.output.ncmCandidatos).toHaveLength(0);
  });
});
