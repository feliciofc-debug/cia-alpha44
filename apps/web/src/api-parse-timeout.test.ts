import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAutenticado: vi.fn(),
}));

vi.mock("./lib/auth-fetch.ts", () => ({
  fetchAutenticado: mocks.fetchAutenticado,
}));

import { api } from "./lib/api.ts";

function pendenteAteAbortar(_url: string, init: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init.signal?.addEventListener(
      "abort",
      () => reject(new DOMException("aborted", "AbortError")),
      { once: true },
    );
  });
}

describe("timeout do /api/parse por feature", () => {
  afterEach(() => {
    vi.useRealTimers();
    mocks.fetchAutenticado.mockReset();
  });

  it("mantém 120 s desligado e usa 600 s somente com upgradeUpload", async () => {
    vi.useFakeTimers();
    mocks.fetchAutenticado.mockImplementation(pendenteAteAbortar);
    const file = new File(["descricao,qtd\nProduto,1"], "teste.csv", { type: "text/csv" });

    const legado = api.parse(file, false);
    await vi.advanceTimersByTimeAsync(119_999);
    expect((mocks.fetchAutenticado.mock.calls[0]![1] as RequestInit).signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(legado).rejects.toMatchObject({ name: "AbortError" });

    const upgrade = api.parse(file, true);
    await vi.advanceTimersByTimeAsync(599_999);
    expect((mocks.fetchAutenticado.mock.calls[1]![1] as RequestInit).signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(upgrade).rejects.toMatchObject({ name: "AbortError" });
  });
});
