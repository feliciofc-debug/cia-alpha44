import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell.tsx";

describe("AppShell", () => {
  it("mostra alerta no menu de usuários quando há tentativa bloqueada recente", () => {
    render(
      <AppShell
        nav="painel"
        onNav={vi.fn()}
        userEmail="admin@test.com"
        isAdmin
        usuariosPendentes={0}
        usuariosAlertaBloqueados={1}
        totalHoje={0}
        busca=""
        onBuscaChange={vi.fn()}
        onBuscaSubmit={vi.fn()}
        onLogout={vi.fn()}
      >
        <div>Conteúdo</div>
      </AppShell>,
    );

    expect(screen.getAllByText("Usuários (!)").length).toBeGreaterThanOrEqual(1);
  });

  it("renderiza branding customizado quando fornecido", () => {
    render(
      <AppShell
        nav="painel"
        onNav={vi.fn()}
        userEmail="cliente@test.com"
        branding={{ displayName: "comexia", tagline: "Cotação inteligente", logoUrl: "/logo-comexia.svg" }}
        totalHoje={0}
        busca=""
        onBuscaChange={vi.fn()}
        onBuscaSubmit={vi.fn()}
        onLogout={vi.fn()}
      >
        <div>Conteúdo</div>
      </AppShell>,
    );

    expect(screen.getAllByText("comexia").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Cotação inteligente")).toBeTruthy();
  });
});
