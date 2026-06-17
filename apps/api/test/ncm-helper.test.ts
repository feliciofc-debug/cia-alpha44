import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { criarNcmCatalog } from "@cia/pipeline";
import {
  conciliarNcm,
  limparCacheNcmHelper,
  lookupNcm,
  sugerirNcm,
} from "../src/services/ncm-helper.js";

const catalog = criarNcmCatalog({
  fonte: "test",
  dataUltimaAtualizacao: null,
  total: 2,
  itens: {
    "22085000": { folha: "Gin e genebra", completa: "Bebidas > Gin" },
    "09030090": { folha: "Mate - Outros", completa: "Cap 9 > Mate" },
  },
});

describe("ncm-helper — conciliação informativa", () => {
  beforeEach(() => {
    limparCacheNcmHelper();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("conciliarNcm — coerente quando IA confirma mesmo NCM", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          sugestao: { ncm: "22085000", descricaoOficial: "Gin", confianca: 0.9 },
          alternativas: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const out = await conciliarNcm(
      { descPt: "Gin London Dry", descOriginal: "Gin", ncm: "22085000" },
      catalog,
    );
    expect(out.ok).toBe(true);
    expect(out.status).toBe("coerente");
    expect(out.ncmInformado).toBe("22085000");
    expect(out.ncmSugerido).toBe("22085000");
  });

  it("conciliarNcm — divergente sem bloquear", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          ok: true,
          sugestao: { ncm: "09030090", descricaoOficial: "Mate", confianca: 0.95 },
          alternativas: [],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const out = await conciliarNcm(
      { descPt: "erva mate 1 kg", descOriginal: "mate", ncm: "21012010" },
      catalog,
    );
    expect(out.status).toBe("divergente");
    expect(out.ncmInformado).toBe("21012010");
    expect(out.ncmSugerido).toBe("09030090");
  });

  it("sugerirNcm — falha graciosa em 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    const out = await sugerirNcm({ descricao: "teste" }, catalog);
    expect(out.ok).toBe(false);
    expect(out.erro).toMatch(/404/);
  });

  it("lookupNcm — fallback catálogo CIA quando Lovable 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("<html>404</html>", { status: 404, headers: { "content-type": "text/html" } }),
    );
    const out = await lookupNcm("22085000", catalog);
    expect(out.ok).toBe(true);
    expect(out.fonte).toBe("cia-catalog");
    expect(out.descricaoCia).toBeTruthy();
  });
});
