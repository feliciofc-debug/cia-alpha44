import { describe, expect, it } from "vitest";
import {
  catalogVersionKey,
  chaveClassificacaoCache,
  normalizarCampoCache,
  partesChaveClassificacaoCache,
} from "../src/classificacao-cache-key.js";

describe("classificacao-cache-key", () => {
  const PV = "PROMPT_PASSE2_V4_TR_V1";
  const CV = "15234_2026-01-15";

  it("normaliza trim, lowercase e ausentes", () => {
    expect(normalizarCampoCache(undefined)).toBe("");
    expect(normalizarCampoCache(null)).toBe("");
    expect(normalizarCampoCache("  Stoßdämpfer  ")).toBe("stoßdämpfer");
  });

  it("mesma chave para material/uso vazios equivalentes", () => {
    const base = { descOriginal: "Stoßdämpfer Ersatzteil" };
    const k1 = chaveClassificacaoCache(base, PV, CV);
    const k2 = chaveClassificacaoCache({ ...base, material: "", uso: null }, PV, CV);
    expect(k1).toBe(k2);
  });

  it("chaves distintas quando promptVersion ou catalogVersion mudam", () => {
    const input = { descOriginal: "Thermoskanne", material: "Edelstahl", uso: "Küche" };
    const kBase = chaveClassificacaoCache(input, PV, CV);
    expect(chaveClassificacaoCache(input, "PROMPT_PASSE2_V5_TR_V1", CV)).not.toBe(kBase);
    expect(chaveClassificacaoCache(input, PV, "15235_2026-01-15")).not.toBe(kBase);
  });

  it("catalogVersionKey usa total e dataUltimaAtualizacao", () => {
    expect(catalogVersionKey({ total: 100, dataUltimaAtualizacao: "2026-03-01" })).toBe("100_2026-03-01");
    expect(catalogVersionKey({ total: 100, dataUltimaAtualizacao: null })).toBe("100_none");
  });

  it("partesChaveClassificacaoCache é determinístico", () => {
    const partes = partesChaveClassificacaoCache(
      { descOriginal: "  Foo  ", material: "BAR", uso: undefined },
      PV,
      CV,
    );
    expect(partes).toBe(`foo|bar||${PV}|${CV}`);
  });
});
