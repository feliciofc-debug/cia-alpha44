import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InputCustoUnitarioVeiculo } from "./fob-kg-edit.tsx";
import type { Item } from "./lib/types.ts";

function itemVeiculo(custoUnitarioUS: number): Item {
  return {
    descOriginal: "ES-T19A-10BLK - patinete eletrico",
    descPt: "Patinete eletrico",
    descDuimp: "Patinete eletrico",
    ncm: "87116000",
    ncmCandidatos: [],
    pesoBrutoKg: 11500,
    pesoLiqKg: 10000,
    qtd: 500,
    fobUnitarioUS: custoUnitarioUS,
    fobTotalUS: custoUnitarioUS * 500,
    aliquotas: { ii: 0.35, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    fobKgFonte: "preco-custo",
  };
}

describe("InputCustoUnitarioVeiculo", () => {
  it("fluxo Editar -> digitar -> Salvar chama PATCH e reflete valor retornado", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => undefined);
    const { rerender } = render(
      <InputCustoUnitarioVeiculo item={itemVeiculo(109)} ordem={0} onCommit={onCommit} />,
    );

    expect(screen.getByText("US$ 109,00 — custo unitário (veículo)")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /editar custo/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "115");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(0, 115));

    rerender(<InputCustoUnitarioVeiculo item={itemVeiculo(115)} ordem={0} onCommit={onCommit} />);
    expect(screen.getByText("US$ 115,00 — custo unitário (veículo)")).toBeInTheDocument();
  });

  it("erro de rede no Salvar fica visível e mantém edição aberta", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => {
      throw new Error("Falha de rede ao salvar custo.");
    });

    render(<InputCustoUnitarioVeiculo item={itemVeiculo(109)} ordem={0} onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: /editar custo/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "115");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    expect(await screen.findByText("Falha de rede ao salvar custo.")).toBeInTheDocument();
    expect(screen.getByRole("spinbutton")).toBeInTheDocument();
  });
});
