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
  const visionBackup = process.env.CLASSIFICACAO_NCM_VISION;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CLASSIFICACAO_NCM_PROVIDER = "gemini";
    delete process.env.CLASSIFICACAO_NCM_VISION;
  });

  afterEach(() => {
    if (envBackup === undefined) delete process.env.CLASSIFICACAO_NCM_PROVIDER;
    else process.env.CLASSIFICACAO_NCM_PROVIDER = envBackup;
    if (visionBackup === undefined) delete process.env.CLASSIFICACAO_NCM_VISION;
    else process.env.CLASSIFICACAO_NCM_VISION = visionBackup;
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

  it("classifica sem imagem usando a tradução PT", async () => {
    sugerirMock.mockResolvedValue({
      ok: true,
      sugestao: {
        ncm: "85167910",
        confianca: 0.89,
        descricaoOficial: "Outros aparelhos eletrotérmicos",
      },
    });

    await classificarItensGeminiLote(
      [{ descOriginal: "空气炸锅", descPtConfirmado: "Fritadeira elétrica sem óleo (air fryer)" }],
      catalog,
      1,
    );

    expect(sugerirMock).toHaveBeenCalledWith(
      expect.objectContaining({
        descricao: expect.stringContaining("Fritadeira elétrica sem óleo"),
      }),
      catalog,
    );
    expect(sugerirMock.mock.calls[0]?.[0]).not.toHaveProperty("imagemBase64");
  });

  it("envia imagem só com flag ligada e mantém visão como refinamento de família", async () => {
    process.env.CLASSIFICACAO_NCM_VISION = "1";
    sugerirMock.mockResolvedValue({
      ok: true,
      sugestao: {
        ncm: "84231000",
        confianca: 0.93,
        descricaoOficial: "Balanças para pessoas, incluídas as balanças para bebês; balanças de uso doméstico",
        justificativaRGI: "Imagem mostra balança de gancho/suspensa, dentro da família 8423.",
      },
    });

    const [r] = await classificarItensGeminiLote(
      [
        {
          descOriginal: "HY-97;挂钩秤",
          descPtConfirmado: "Balança de gancho portátil",
          fotoBase64: Buffer.from("fake-image").toString("base64"),
          fotoMime: "image/jpeg",
        },
      ],
      catalog,
      1,
    );

    expect(r!.ok).toBe(true);
    expect(r!.output.ncmCandidatos[0]!.ncm).toBe("84231000");
    expect(sugerirMock).toHaveBeenCalledWith(
      expect.objectContaining({
        imagemBase64: Buffer.from("fake-image").toString("base64"),
        imagemMime: "image/jpeg",
      }),
      catalog,
    );
  });

  it("não aplica visão de baixa confiança que pula para capítulo incoerente com a família textual", async () => {
    process.env.CLASSIFICACAO_NCM_VISION = "1";
    sugerirMock.mockResolvedValue({
      ok: true,
      sugestao: {
        ncm: "39241000",
        confianca: 0.89,
        descricaoOficial: "Serviços de mesa e outros utensílios de mesa ou de cozinha, de plástico",
      },
    });

    const [r] = await classificarItensGeminiLote(
      [
        {
          descOriginal: "HY-97;挂钩秤",
          descPtConfirmado: "Balança de gancho portátil",
          fotoBase64: Buffer.from("fake-image").toString("base64"),
          fotoMime: "image/jpeg",
        },
      ],
      catalog,
      1,
    );

    expect(r!.ok).toBe(false);
    expect(r!.output.ncmCandidatos).toHaveLength(0);
    expect(r!.output.descDuimp).toMatch(/divergiu radicalmente/i);
  });

  it("aplica visão divergente de alta confiança com aviso de conferência", async () => {
    process.env.CLASSIFICACAO_NCM_VISION = "1";
    sugerirMock.mockResolvedValue({
      ok: true,
      sugestao: {
        ncm: "85098090",
        confianca: 0.95,
        descricaoOficial: "Outros aparelhos eletromecânicos com motor elétrico incorporado, de uso doméstico",
        justificativaRGI: "Vejo pedicuro elétrico na imagem.",
      },
    });

    const [r] = await classificarItensGeminiLote(
      [
        {
          descOriginal: "HY-80036;电动磨脚皮器",
          descPtConfirmado: "Lixadeira elétrica para pés",
          fotoBase64: Buffer.from("fake-image").toString("base64"),
          fotoMime: "image/jpeg",
        },
      ],
      catalog,
      1,
    );

    expect(r!.ok).toBe(true);
    expect(r!.output.ncmCandidatos[0]!.ncm).toBe("85098090");
    expect(r!.output.avisoAtributo).toMatch(/Visão prevaleceu — conferir/i);
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
