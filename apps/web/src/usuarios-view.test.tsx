import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UsuariosView } from "./usuarios-view.tsx";
import type { LoginEventoAdmin, UsuarioAdmin } from "./lib/api.ts";

const usuarios: UsuarioAdmin[] = [
  {
    id: "u1",
    email: "paulo.mesquita@innove888.com.br",
    nome: "Paulo Mesquita",
    status: "bloqueado",
    role: "operador",
    criadoEm: "2026-07-21T10:00:00.000Z",
    aprovadoEm: null,
    aprovadoPor: null,
    ultimoLoginEm: null,
  },
];

const loginEventos: LoginEventoAdmin[] = [
  {
    id: "le1",
    usuarioId: "u1",
    email: "paulo.mesquita@innove888.com.br",
    sucesso: false,
    motivo: "bloqueado",
    criadoEm: "2026-07-22T00:10:00.000Z",
  },
];

describe("UsuariosView", () => {
  it("mostra último login e atividade recente com destaque para bloqueado", () => {
    render(
      <UsuariosView
        usuarios={usuarios}
        loginEventos={loginEventos}
        loading={false}
        acaoId={null}
        onAprovar={vi.fn()}
        onBloquear={vi.fn()}
      />,
    );

    expect(screen.getByText("Último login")).toBeTruthy();
    expect(screen.getByText("Atividade recente")).toBeTruthy();
    expect(screen.getAllByText("paulo.mesquita@innove888.com.br")).toHaveLength(2);
    expect(screen.getAllByText("Bloqueado").length).toBeGreaterThanOrEqual(2);
  });
});
