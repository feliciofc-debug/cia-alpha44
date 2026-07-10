import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InputCustoUnitarioVeiculo } from "../src/fob-kg-edit.tsx";
import type { Item } from "../src/lib/types.ts";

function itemVeiculo(overrides: Partial<Item> = {}): Item {
  return {
    descOriginal: "ES-T19A-10BLK — 滑板车T1 MAX",
    descPt: "Patinete elétrico",
    descDuimp: "Patinete elétrico",
    ncm: "87116000",
    ncmCandidatos: [],
    pesoBrutoKg: 11500,
    pesoLiqKg: 10000,
    qtd: 500,
    fobUnitarioUS: 109,
    fobTotalUS: 54500,
    aliquotas: { ii: 0.126, ipi: 0.35, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    fobKgFonte: "preco-custo",
    fobKgAvisos: ["Base FOB = valor de custo (veículo) — confirme o custo unitário."],
    ...overrides,
  };
}

describe("InputCustoUnitarioVeiculo", () => {
  afterEach(() => cleanup());

  it("fluxo Editar → digitar → Salvar chama PATCH e reflete valor retornado", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => undefined);
    const { rerender } = render(
      <InputCustoUnitarioVeiculo item={itemVeiculo()} ordem={0} onCommit={onCommit} />,
    );

    expect(screen.getByText(/US\$ 109,00 — custo unitário \(veículo\)/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /editar custo/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "115");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(0, 115));
    rerender(
      <InputCustoUnitarioVeiculo
        item={itemVeiculo({ fobUnitarioUS: 115, fobTotalUS: 57500 })}
        ordem={0}
        onCommit={onCommit}
      />,
    );

    expect(await screen.findByText(/US\$ 115,00 — custo unitário \(veículo\)/)).toBeTruthy();
    expect(screen.getByText(/Custo salvo: US\$ 115,00\./)).toBeTruthy();
  });

  it("erro de rede no salvar mantém edição aberta e exibe mensagem", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => {
      throw new Error("Falha de rede");
    });
    render(<InputCustoUnitarioVeiculo item={itemVeiculo()} ordem={0} onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: /editar custo/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "115");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText("Falha de rede")).toBeTruthy();
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });
});
