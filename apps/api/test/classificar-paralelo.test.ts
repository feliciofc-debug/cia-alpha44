import { describe, it, expect } from "vitest";
import { mapComConcorrencia } from "../src/util/map-concorrencia.js";

describe("mapComConcorrencia", () => {
  it("preserva ordem com 13 itens e concorrência 5", async () => {
    const items = Array.from({ length: 13 }, (_, i) => i);
    const out = await mapComConcorrencia(items, 5, async (n) => {
      await new Promise((r) => setTimeout(r, (13 - n) * 2));
      return n * 10;
    });
    expect(out).toEqual(items.map((n) => n * 10));
  });
});
