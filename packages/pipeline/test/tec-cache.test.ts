import { describe, expect, it } from "vitest";
import { criarTecSource, type TecEntry } from "../src/tec.js";
import { loadTecCache } from "../src/seed.js";

/**
 * Amostra de 20 NCMs — valores conferidos contra planilhas em tools/data-fontes/
 * (geradas em 2026-06-10). Referências de linha = linha Excel (1-based).
 */

interface AmostraNcm {
  ncm: string;
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
  /** Linha-fonte MDIC Anexo II col. "Alíquota aplicada (%)" */
  refII?: string;
  /** Linha-fonte TIPI col. "ALÍQUOTA (%)" */
  refIPI?: string;
  ipiNt?: boolean;
}

const AMOSTRA: AmostraNcm[] = [
  {
    ncm: "94051190",
    ii: 0.162,
    ipi: 0.0975,
    pis: 0.021,
    cofins: 0.0965,
    refII: "tec-aplicada-brasil.xlsx — Anexo II, linha 9244, col. Alíquota aplicada = 16,2%",
    refIPI: "tipi.xlsx — Tabela Completa, linha 15438, col. ALÍQUOTA = 9,75%",
  },
  {
    ncm: "87116000",
    ii: 0.18,
    ipi: 0.35,
    pis: 0.021,
    cofins: 0.0965,
    refII: "tec-aplicada-brasil.xlsx — Anexo II, linha 8775, col. Alíquota aplicada = 18%",
    refIPI: "tipi.xlsx — Tabela Completa, linha 14495, col. ALÍQUOTA = 35%",
  },
  { ncm: "94052100", ii: 0.162, ipi: 0.0975, pis: 0.021, cofins: 0.0965 },
  { ncm: "82042000", ii: 0.162, ipi: 0.052, pis: 0.021, cofins: 0.0965 },
  { ncm: "87141000", ii: 0.144, ipi: 0.12, pis: 0.021, cofins: 0.0965 },
  { ncm: "42029200", ii: 0.35, ipi: 0.065, pis: 0.021, cofins: 0.0965 },
  { ncm: "85258929", ii: 0.2, ipi: 0.2, pis: 0.021, cofins: 0.0965 },
  { ncm: "85044010", ii: 0.18, ipi: 0.05, pis: 0.021, cofins: 0.0965 },
  { ncm: "85098090", ii: 0.18, ipi: 0.065, pis: 0.021, cofins: 0.0965 },
  { ncm: "73269090", ii: 0.18, ipi: 0.05, pis: 0.021, cofins: 0.0965 },
  { ncm: "85366100", ii: 0.16, ipi: 0.0975, pis: 0.021, cofins: 0.0965 },
  { ncm: "90191000", ii: 0.126, ipi: 0.052, pis: 0.021, cofins: 0.0965 },
  { ncm: "76151000", ii: 0.144, ipi: 0.065, pis: 0.021, cofins: 0.0965 },
  {
    ncm: "87034000",
    ii: 0.35,
    ipi: 0.1881,
    pis: 0.0262,
    cofins: 0.1257,
  },
  { ncm: "87089990", ii: 0.18, ipi: 0.0325, pis: 0.021, cofins: 0.0965 },
  { ncm: "40111000", ii: 0.16, ipi: 0.0975, pis: 0.021, cofins: 0.0965 },
  { ncm: "84713012", ii: 0.16, ipi: 0.15, pis: 0.021, cofins: 0.0965 },
  {
    ncm: "01012100",
    ii: 0,
    ipi: 0,
    pis: 0.021,
    cofins: 0.0965,
    ipiNt: true,
    refIPI: "tipi.xlsx — linha 0101.21.00, col. ALÍQUOTA = NT",
  },
  { ncm: "39241000", ii: 0.162, ipi: 0.0675, pis: 0.021, cofins: 0.0965 },
  { ncm: "84295219", ii: 0.126, ipi: 0, pis: 0.0262, cofins: 0.1257 },
];

function close(a: number, b: number, eps = 1e-6) {
  expect(Math.abs(a - b)).toBeLessThanOrEqual(eps);
}

describe("tec-cache.json — seed TEC/TIPI oficial", () => {
  const cache = loadTecCache();

  it("cobre todos os NCM-8 vigentes com cobertura >= 98%", () => {
    expect(cache.cobertura?.ii.percentual ?? 0).toBeGreaterThanOrEqual(0.98);
    expect(cache.cobertura?.ipi.percentual ?? 0).toBeGreaterThanOrEqual(0.98);
    expect(Object.keys(cache.itens).length).toBeGreaterThanOrEqual(10500);
  });

  it("entradas têm fonte e vigencia da tabela-fonte", () => {
    const e = cache.itens["94051190"] as TecEntry;
    expect(e.fonte).toBeTruthy();
    expect(e.vigencia).toMatch(/Res\. Gecex/);
    expect(e.vigencia).toMatch(/Decreto|ADE RFB|TIPI/);
  });

  it.each(AMOSTRA)("NCM $ncm — alíquotas oficiais ($refII)", ({ ncm, ii, ipi, pis, cofins, ipiNt }) => {
    const e = cache.itens[ncm] as TecEntry;
    expect(e, `NCM ${ncm} ausente no cache`).toBeDefined();
    close(e.ii, ii);
    close(e.ipi, ipi);
    close(e.pis, pis);
    close(e.cofins, cofins);
    expect(e.fonte).toBeTruthy();
    expect(e.vigencia).toBeTruthy();
    if (ipiNt) {
      expect(e.ipiNt).toBe(true);
      expect(e.avisos?.some((a) => a.includes("IPI NT"))).toBe(true);
    }
  });

  it("autopeças com Ex (73269090, 85044010) mantêm PIS/COFINS padrão + aviso", () => {
    for (const ncm of ["73269090", "85044010"]) {
      const e = cache.itens[ncm] as TecEntry;
      expect(e.pis).toBeCloseTo(0.021, 6);
      expect(e.cofins).toBeCloseTo(0.0965, 6);
      expect(e.avisos?.some((a) => a.includes("qualificador Ex"))).toBe(true);
    }
  });

  it("criarTecSource resolve alíquotas e fonte por NCM", () => {
    const src = criarTecSource(cache);
    const r = src.buscar("94051190");
    expect(r.encontrado).toBe(true);
    close(r.aliquotas.ii, 0.162);
    close(r.aliquotas.ipi, 0.0975);
    expect(r.fonte).toContain("MDIC");
  });

  it("NCM ausente retorna pis/cofins padrão do cache", () => {
    const src = criarTecSource(cache);
    const r = src.buscar("99999999");
    expect(r.encontrado).toBe(false);
    close(r.aliquotas.pis, cache.pisPadrao);
    close(r.aliquotas.cofins, cache.cofinsPadrao);
  });
});
