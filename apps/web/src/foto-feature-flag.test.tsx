import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyntheticEvent } from "react";
import type { Item } from "./lib/types.ts";

const mocks = vi.hoisted(() => ({
  fetchAutenticado: vi.fn(),
}));

vi.mock("./lib/auth-fetch.ts", () => ({
  fetchAutenticado: mocks.fetchAutenticado,
}));

import { FotoItemPorFeature } from "./foto-autenticada.tsx";

function item(foto: Partial<Pick<Item, "fotoBase64" | "fotoMime" | "fotoRef" | "fotoUrl">>): Item {
  return {
    descOriginal: "Produto",
    descPt: "Produto",
    descDuimp: "Produto",
    ncm: "42029200",
    ncmCandidatos: [],
    pesoBrutoKg: 1,
    pesoLiqKg: 1,
    qtd: 1,
    fobUnitarioUS: 10,
    fobTotalUS: 10,
    aliquotas: { ii: 0, ipi: 0, pis: 0, cofins: 0, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    ...foto,
  };
}

describe("FotoItemPorFeature", () => {
  const createObjectURL = vi.fn(() => "blob:foto-autenticada");
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    mocks.fetchAutenticado.mockReset();
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
  });

  afterEach(() => {
    cleanup();
  });

  it("desligado reproduz src, atributos e handler legados sem fetch autenticado", () => {
    const onError = vi.fn((event: SyntheticEvent<HTMLImageElement>) => {
      event.currentTarget.style.display = "none";
    });
    const { rerender } = render(
      <FotoItemPorFeature
        item={item({ fotoBase64: "YWJj", fotoMime: "image/png" })}
        upgradeUpload={false}
        alt="Produto"
        className="foto-legada"
        onError={onError}
      />,
    );

    let img = screen.getByRole("img", { name: "Produto" });
    expect(img.getAttribute("src")).toBe("data:image/png;base64,YWJj");
    expect(img.getAttribute("class")).toBe("foto-legada");
    fireEvent.error(img);
    expect(onError).toHaveBeenCalledOnce();
    expect(img.style.display).toBe("none");

    rerender(
      <FotoItemPorFeature
        item={item({ fotoUrl: "/api/cotacoes/cot-1/foto/0" })}
        upgradeUpload={false}
        alt=""
        className="foto-tabela"
      />,
    );
    img = document.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/api/cotacoes/cot-1/foto/0");
    expect(img.getAttribute("class")).toBe("foto-tabela");
    expect(mocks.fetchAutenticado).not.toHaveBeenCalled();
  });

  it("ligado busca fotoRef com autenticação e revoga o blob no unmount", async () => {
    mocks.fetchAutenticado.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["imagem"], { type: "image/png" }),
    });
    const { unmount } = render(
      <FotoItemPorFeature
        item={item({ fotoRef: "0123456789abcdef0123456789abcdef", fotoMime: "image/png" })}
        upgradeUpload
        alt="Foto protegida"
        className="foto-protegida"
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "Foto protegida" }).getAttribute("src")).toBe(
        "blob:foto-autenticada",
      );
    });
    expect(mocks.fetchAutenticado).toHaveBeenCalledWith(
      "/api/parse/fotos/0123456789abcdef0123456789abcdef",
    );
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:foto-autenticada");
  });
});
