/**
 * Gate d003 — planilha sem cabeçalho: mapeamento matemático prevalece sobre IA.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseSupplierFile } from "@cia/pipeline";
import { ingerirArquivo } from "../src/services/ingest.js";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const FIXTURE_D003 = readFileSync(join(ROOT, "tools/fixtures/d003.xlsx"));

/** Simula IA que mapeia col7 (preço unitário) como FOB — bug em produção. */
const mapaIaErrado = async () => ({
  descricao: 2,
  qtd: 5,
  preco: 7,
  fob: 7,
  peso_bruto: 9,
  peso: 11,
});

describe("gate d003 — mapeamento matemático sem cabeçalho", () => {
  it("13 itens, Σ FOB US$ 599.700 e pesos corretos mesmo com IA errada", async () => {
    const ocr = { disponivel: false, extrair: async () => ({ texto: "", paginas: 0, avisos: [] }) };
    const ingested = await ingerirArquivo("d003.xlsx", FIXTURE_D003, ocr);

    expect(ingested.totalLinhas).toBe(13);
    expect(ingested.avisos.some((a) => /matemática/i.test(a))).toBe(true);

    const sumFob = ingested.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    const sumBruto = ingested.linhas.reduce((s, l) => s + (l.pesoBrutoKg ?? 0), 0);
    const sumLiq = ingested.linhas.reduce((s, l) => s + (l.pesoLiqKg ?? 0), 0);
    expect(sumFob).toBeCloseTo(599700, 2);
    expect(sumBruto).toBeCloseTo(19120, 2);
    expect(sumLiq).toBeCloseTo(18220, 2);

    ingested.linhas.forEach((l) => {
      expect(l.fobUnitarioUS).not.toBeNull();
      expect(l.fobTotalUS).not.toBeNull();
      expect((l.fobTotalUS ?? 0)).toBeGreaterThan((l.fobUnitarioUS ?? 0));
    });
  }, 60000);

  it("parseSupplierFile com IA errada ainda retorna FOB declarado da col8", async () => {
    const parsed = await parseSupplierFile(FIXTURE_D003, { mapearColunasIA: mapaIaErrado });
    const sumFob = parsed.linhas.reduce((s, l) => s + (l.fobTotalUS ?? 0), 0);
    expect(parsed.totalLinhas).toBe(13);
    expect(sumFob).toBeCloseTo(599700, 2);
  });
});
