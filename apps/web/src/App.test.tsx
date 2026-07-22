import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./App.tsx";

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
}));

vi.mock("./auth/auth.tsx", () => ({
  useAuth: () => ({
    login: mocks.login,
    register: mocks.register,
  }),
}));

vi.mock("./lib/api.ts", () => ({
  api: {
    meta: vi.fn(async () => ({ comexTotal: 0 })),
  },
}));

describe("LoginScreen", () => {
  it("renderiza em card a mensagem de bloqueio retornada pela API", async () => {
    const user = userEvent.setup();
    mocks.login.mockRejectedValueOnce(new Error("Acesso suspenso. Fale com financeiro@empresa.test."));

    render(<LoginScreen />);

    await user.type(screen.getByLabelText("E-mail"), "paulo.mesquita@innove888.com.br");
    await user.type(screen.getByLabelText("Senha"), "senha-forte");
    const botoesEntrar = screen.getAllByRole("button", { name: "Entrar" });
    await user.click(botoesEntrar[botoesEntrar.length - 1]!);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Acesso suspenso. Fale com financeiro@empresa.test.");
  });
});
