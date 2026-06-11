import { describe, it, expect } from "vitest";
import { PIS_COFINS_FONTE_PADRAO } from "@cia/shared";
import { criarTecSource, montarRastrosCache } from "../src/tec.js";
import type { TecCache } from "../src/tec.js";

const cacheMin: TecCache = {
  fonte: "Seed teste",
  geradoEm: "2026-06-11T10:00:00.000Z",
  pisPadrao: 0.021,
  cofinsPadrao: 0.0965,
  fundamentoPisCofinsPadrao: PIS_COFINS_FONTE_PADRAO,
  itens: {
    "87116000": {
      ii: 0.18,
      ipi: 0.35,
      pis: 0.021,
      cofins: 0.0965,
      fonte: "MDIC/CAMEX — Res. Gecex 272/2021 + RFB — TIPI",
      vigencia: "II: Res. Gecex 770/2025 (Anexo II) | IPI: Decreto 12.665/2025",
    },
    "87089990": {
      ii: 0.18,
      ipi: 0.05,
      pis: 0.0312,
      cofins: 0.1437,
      fundamentoPisCofins:
        "Lei 10.865/2004, art. 8º, §9-A; autopeça — Lista MDIC Regime Autopeças (Lei 10.485/2002)",
      vigencia: "II: Res. Gecex 770/2025 | IPI: Decreto 12.665/2025",
    },
  },
};

describe("tec — rastro por tributo", () => {
  it("buscar retorna rastros com fontes legais distintas por tributo", () => {
    const src = criarTecSource(cacheMin);
    const res = src.buscar("87116000");
    expect(res.rastros?.ii?.fonte).toContain("Gecex");
    expect(res.rastros?.ipi?.fonte).toContain("Decreto 12.665");
    expect(res.rastros?.pis?.fonte).toBe(PIS_COFINS_FONTE_PADRAO);
    expect(res.rastros?.cofins?.fonte).toBe(PIS_COFINS_FONTE_PADRAO);
    expect(res.rastros?.ii?.origem).toBe("tec-cache");
  });

  it("exceção autopeça usa fundamento Lei 10.485", () => {
    const src = criarTecSource(cacheMin);
    const res = src.buscar("87089990");
    expect(res.rastros?.pis?.fonte).toMatch(/10\.485/);
    expect(res.rastros?.pis?.fonte).not.toMatch(/Gecex/i);
  });

  it("montarRastrosCache usa consultadoEm do cache", () => {
    const entry = cacheMin.itens["87116000"]!;
    const aliquotas = { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 };
    const r = montarRastrosCache(aliquotas, entry, cacheMin, cacheMin.geradoEm!);
    expect(r.ii?.consultadoEm).toBe("2026-06-11T10:00:00.000Z");
  });
});
