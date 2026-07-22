import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AvisoBannerPainel } from "./dashboard.tsx";

describe("AvisoBannerPainel", () => {
  it("mostra o banner para operador", () => {
    render(<AvisoBannerPainel mensagem="Pagamento pendente. Contate o financeiro." isAdmin={false} />);

    expect(screen.getByRole("status").textContent).toBe("Pagamento pendente. Contate o financeiro.");
  });

  it("não mostra o banner para admin", () => {
    render(<AvisoBannerPainel mensagem="Pagamento pendente. Contate o financeiro." isAdmin />);

    expect(screen.queryByRole("status")).toBeNull();
  });
});
