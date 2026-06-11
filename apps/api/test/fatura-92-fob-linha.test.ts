import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBenchmarkIndex } from "@cia/pipeline";
import { preencherFobKgPlanilha, FOB_KG_FONTE_LINHA } from "@cia/pipeline";
import type { LinhaCrua } from "@cia/pipeline";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..", "..", "..");

describe("fatura 92 — FOB linha E2E (fixture JSON)", () => {
  it("0 partes pendentes, FOB DI ~77.391, fonte linha em centavos", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/fatura-92-limpa-classificar.json"), "utf8"),
    ) as { linhas: LinhaCrua[] };

    const index = buildBenchmarkIndex([]);
    const { linhas, metas } = preencherFobKgPlanilha(json.linhas, index);

    const pecas = linhas.filter((l) => /^ACC-ES/i.test(l.descOriginal));
    expect(pecas.length).toBe(11);
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]!;
      if (!/^ACC-ES/i.test(l.descOriginal)) continue;
      expect(l.fobTotalUS ?? 0).toBeGreaterThan(0);
      expect(metas[i]?.fobKgFonte).toBe(FOB_KG_FONTE_LINHA);
      expect(metas[i]?.fobPendente).not.toBe(true);
    }

    const patinetes = linhas.filter((l) => l.descOriginal.startsWith("ES-T19"));
    const pecasFob = pecas.reduce((s, p) => s + (p.fobTotalUS ?? 0), 0);
    const fobPatinetesPrecoCusto = 710 * 109;
    expect(pecasFob).toBeGreaterThan(0);
    expect(pecasFob).toBeLessThan(5);

    const fobDiSimulado =
      patinetes.reduce((s, p) => s + (p.qtd ?? 0) * 109, 0) +
      pecas.reduce((s, p) => s + (p.fobTotalUS ?? 0), 0);
    expect(fobDiSimulado).toBeGreaterThan(77300);
    expect(fobDiSimulado).toBeLessThan(77500);
    expect(fobDiSimulado).toBeCloseTo(fobPatinetesPrecoCusto + pecasFob, 1);
  });
});
