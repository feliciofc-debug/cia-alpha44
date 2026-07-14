import { describe, expect, it } from "vitest";
import type { Range } from "xlsx";
import { parsePlanilhaRows } from "../src/parser.js";

describe("parser — herança de mescla vertical + total sem rótulo", () => {
  it("propaga descrição mesclada para linhas filhas sem alterar qty/peso", () => {
    const rows: unknown[][] = [
      ["REF", "货物名称", "件数", "每箱数量", "总数量", "毛重", "总重"],
      ["H320", "17寸 mochila preto 25", 10, 60, 600, 48, 480],
      ["H321", null, 10, 60, 600, 48, 480],
      ["H322", "outra mochila", 5, 20, 100, 10, 50],
    ];
    const merges: Range[] = [{ s: { r: 1, c: 1 }, e: { r: 2, c: 1 } }];

    const parsed = parsePlanilhaRows(rows, "teste", merges);

    expect(parsed.linhas).toHaveLength(3);
    expect(parsed.linhas[0]!.descricao).toContain("mochila preto");
    expect(parsed.linhas[1]!.descricao).toContain("H321");
    expect(parsed.linhas[1]!.descricao).toContain("mochila preto");
    expect(parsed.linhas[1]!.qtd).toBeGreaterThan(0);
    expect(parsed.linhas[2]!.descricao).toContain("outra mochila");
  });

  it("descarta linha de totais sem rótulo quando agregados batem com soma das colunas", () => {
    const rows: unknown[][] = [
      ["REF", "货物名称", "件数", "每箱数量", "总数量", "毛重", "总重"],
      ["H320", "mochila A", 10, 60, 600, 48, 480],
      ["H321", "mochila B", 20, 30, 600, 52, 520],
      [null, null, 30, null, null, null, 1000],
    ];

    const parsed = parsePlanilhaRows(rows, "teste");

    expect(parsed.linhas).toHaveLength(2);
    expect(parsed.linhasTotaisDescartadas).toBe(1);
  });
});
