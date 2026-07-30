import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PainelEditorCotacao } from "./painel-editor.tsx";
import type { EditorDraft } from "./lib/editor-cotacao.ts";

function draftBase(): EditorDraft {
  return {
    origem: "CN",
    destino: "AL",
    destinoSelecao: "AL",
    regimeDestinoId: null,
    regimeDestinoParams: null,
    ufEmpresa: "AL",
    regimeIcms: "AL_DIFERIDO",
    benefFiscal: "ALAGOAS",
    empresaTrade: "comexia",
    cliente: "Cliente teste",
    cambio: 5.5,
    freteTotalUS: 3500,
    siscomex: 154.23,
    adicionaisVaUS: 0,
    reducaoBaseUS: 0,
    markupPct: 0.12,
    qtdContainers: 1,
    despesas: [],
    paramsAvancados: {
      pisSaida: 0.0165,
      cofinsSaida: 0.076,
      icmsSaida: 0.04,
      csllSobreMarkup: 0.09,
      irrfAliq: 0.25,
      irrfBaseNotaPct: 0.027,
    },
    icmsSaidaManualFlag: false,
  };
}

describe("PainelEditorCotacao", () => {
  it("renderiza regimes fiscais junto das UFs no seletor de destino da cotacao", () => {
    render(
      <PainelEditorCotacao
        draft={draftBase()}
        onChange={vi.fn()}
        onAplicar={vi.fn()}
        modo="analise"
      />,
    );

    const destino = screen.getByLabelText("Destino (UF / regime)");
    const opcoes = within(destino).getAllByRole("option").map((option) => option.textContent);

    expect(opcoes).toContain("AL — Alagoas");
    expect(opcoes).toContain("Santa Catarina — TTD 2,6% (fase 1)");
    expect(opcoes).toContain("Santa Catarina — TTD 1% (fase 2)");
    expect(opcoes).toContain("Minas Gerais — Corredor");
    expect(opcoes).toContain("Minas Gerais — TTS E-commerce");
    expect(opcoes).toContain("Espírito Santo — Invest/Compete");
  });
});
