import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { totaisPesoExibicao, pesoLiqReal } from "@cia/pipeline";
import type { Item } from "@cia/shared";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, "..", "..", "..");

function itemPartial(p: Partial<Item> & Pick<Item, "descOriginal">): Item {
  return {
    descPt: p.descOriginal,
    descDuimp: "",
    ncm: "87116000",
    ncmCandidatos: [],
    aliquotas: { ii: 0.18, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    fobTotalUS: 0,
    ...p,
  } as Item;
}

describe("PDF orçamento — pesos NET/GROSS distintos", () => {
  it("fatura 92 limpa: ~14.213 líq / ~16.330 bruto (não colapsar)", () => {
    const json = JSON.parse(
      fs.readFileSync(path.join(ROOT, "tools/fatura-92-limpa-classificar.json"), "utf8"),
    ) as { linhas: Array<{ descOriginal: string; pesoLiqKg?: number; pesoBrutoKg?: number | null }> };

    const itens = json.linhas.map((l) =>
      itemPartial({
        descOriginal: l.descOriginal,
        pesoLiqKg: pesoLiqReal({
          pesoLiqKg: l.pesoLiqKg ?? null,
          pesoBrutoKg: l.pesoBrutoKg ?? null,
        }),
        pesoBrutoKg: l.pesoBrutoKg ?? null,
        fobTotalUS: 1,
      }),
    );

    const { pesoLiqKg, pesoBrutoKg, baseDespachanteBruta } = totaisPesoExibicao(itens);
    expect(pesoLiqKg).toBeGreaterThan(14000);
    expect(pesoLiqKg).toBeLessThan(14500);
    expect(pesoBrutoKg).toBeGreaterThan(16000);
    expect(pesoBrutoKg).toBeLessThan(16500);
    expect(pesoLiqKg).not.toBeCloseTo(pesoBrutoKg, 0);
    expect(baseDespachanteBruta).toBe(true);
  });
});
