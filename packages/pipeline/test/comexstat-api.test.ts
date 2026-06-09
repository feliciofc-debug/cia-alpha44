import { describe, it, expect } from "vitest";
import { comexRowsParaEntradas } from "../src/comexstat-api.js";

describe("ComexStat API — parse de linhas", () => {
  it("calcula FOB/kg e CIF/kg a partir de metricFOB e metricKG", () => {
    const rows = comexRowsParaEntradas([
      {
        coNcm: "94052100",
        ncm: "Luminárias de teto LED",
        metricFOB: "3507610",
        metricKG: "1000000",
        metricCIF: "3741493",
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ncm).toBe("94052100");
    expect(rows[0]!.fobKg).toBeCloseTo(3.50761, 4);
    expect(rows[0]!.cifKg).toBeCloseTo(3.741493, 4);
  });

  it("ignora NCM inválido ou sem peso", () => {
    expect(comexRowsParaEntradas([{ coNcm: "", metricFOB: 100, metricKG: 10 }])).toHaveLength(0);
    expect(comexRowsParaEntradas([{ coNcm: "94052100", metricFOB: 100, metricKG: 0 }])).toHaveLength(0);
  });
});

describe("ComexStat API — integração (rede)", () => {
  it("busca FOB/kg na API MDIC (importação agregada)", async () => {
    if (process.env.CI === "true" || process.env.SKIP_COMEXSTAT_LIVE === "1") return;

    const { fetchComexStatImport } = await import("../src/comexstat-api.js");
    const rows = await fetchComexStatImport();
    expect(rows.length).toBeGreaterThan(5000);
    const lustre = rows.find((e) => e.ncm === "94052100");
    expect(lustre?.fobKg).toBeGreaterThan(0);
  }, 60_000);

  it("fetchComexStatFobKg encontra NCM no cache local", async () => {
    const { fetchComexStatFobKg } = await import("../src/comexstat-api.js");
    const row = await fetchComexStatFobKg("94052100");
    expect(row).not.toBeNull();
    expect(row!.fobKg).toBeGreaterThan(0);
  });
});
