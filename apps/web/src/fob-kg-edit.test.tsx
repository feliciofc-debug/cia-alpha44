import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InputCustoUnitarioVeiculo, InputFobKgItem } from "./fob-kg-edit.tsx";
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

function itemNaoVeiculoFob(fobKgManual?: number | null): Item {
  return {
    descOriginal: "Luminária LED",
    descPt: "Luminária LED",
    descDuimp: "Luminária LED",
    ncm: "94052100",
    ncmCandidatos: [],
    pesoBrutoKg: 100,
    pesoLiqKg: 100,
    qtd: 10,
    fobUnitarioUS: 12,
    fobTotalUS: 120,
    fobKgManual,
    aliquotas: { ii: 0.16, ipi: 0.05, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
    aliquotasOverride: false,
    anuencia: [],
    antidumping: false,
    fobKgFonte: "planilha-cliente (FOB declarado)",
  };
}

describe("InputFobKgItem", () => {
  it("exibe valor protegido e salva override manual sobre FOB declarado", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => undefined);
    const { rerender } = render(<InputFobKgItem item={itemNaoVeiculoFob(null)} ordem={2} onCommit={onCommit} />);

    expect(screen.getByText(/\$ 1\.20\/kg — FOB declarado na planilha/i)).toBeTruthy();
    expect(screen.queryByRole("spinbutton")).toBeNull();

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "2.5");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(2, 2.5));

    rerender(<InputFobKgItem item={itemNaoVeiculoFob(2.5)} ordem={2} onCommit={onCommit} />);
    expect(screen.getByText(/\$ 2\.50\/kg — manual do operador/i)).toBeTruthy();
    expect(screen.getByText(/referência anterior: FOB declarado na planilha · \$ 1\.20\/kg/i)).toBeTruthy();
  });

  it("Cancelar descarta edição local sem chamar commit", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => undefined);
    render(<InputFobKgItem item={itemNaoVeiculoFob(null)} ordem={0} onCommit={onCommit} />);

    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "9");
    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    expect(screen.getByRole("button", { name: /^editar$/i })).toBeTruthy();
  });
});

describe("InputCustoUnitarioVeiculo", () => {
  it("fluxo Editar -> digitar -> Salvar chama PATCH e reflete valor retornado", async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => undefined);
    const { rerender } = render(
      <InputCustoUnitarioVeiculo item={itemVeiculo(109)} ordem={0} onCommit={onCommit} />,
    );

    expect(screen.getByText("US$ 109,00 — custo unitário (veículo)")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /editar custo/i }));
    const input = screen.getByRole("spinbutton");
    await user.clear(input);
    await user.type(input, "115");
    await user.click(screen.getByRole("button", { name: /^salvar$/i }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledWith(0, 115));

    rerender(<InputCustoUnitarioVeiculo item={itemVeiculo(115)} ordem={0} onCommit={onCommit} />);
    expect(screen.getByText("US$ 115,00 — custo unitário (veículo)")).toBeTruthy();
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

    expect(await screen.findByText("Falha de rede ao salvar custo.")).toBeTruthy();
    expect(screen.getByRole("spinbutton")).toBeTruthy();
  });
});
