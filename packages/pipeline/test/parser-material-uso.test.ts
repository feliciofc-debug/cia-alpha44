import { describe, it, expect } from "vitest";
import { parsePlanilhaRows } from "../src/parser.js";

describe("parser — material e uso (item 3b)", () => {
  it("mapeia colunas 材质 e 用途", () => {
    const rows = [
      ["Descrição", "Material", "Uso", "NCM"],
      ["减震器 Shock Absorber", "铁", "配件", "87141000"],
    ];
    const parsed = parsePlanilhaRows(rows, "test");
    expect(parsed.linhas[0]?.material).toBe("铁");
    expect(parsed.linhas[0]?.uso).toBe("配件");
  });
});
