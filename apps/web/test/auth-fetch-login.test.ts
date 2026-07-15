import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY } from "../src/auth/token-storage.ts";
import {
  fetchAutenticado,
  registerSessionExpiredHandler,
  withAuthHeaders,
} from "../src/lib/auth-fetch.ts";

function jwtValido(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `hdr.${payload}.sig`;
}

describe("auth-fetch — bearer sempre do localStorage", () => {
  const fetchMock = vi.fn();
  const onExpired = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    registerSessionExpiredHandler(onExpired);
    fetchMock.mockReset();
    onExpired.mockReset();
  });

  afterEach(() => {
    registerSessionExpiredHandler(null);
    vi.unstubAllGlobals();
  });

  it("withAuthHeaders anexa Bearer lido do localStorage", async () => {
    localStorage.setItem(TOKEN_KEY, jwtValido());
    const init = await withAuthHeaders({});
    expect(new Headers(init.headers).get("Authorization")).toMatch(/^Bearer /);
  });

  it("fetchAutenticado faz retry quando 401 sem bearer e token gravado no mesmo tick", async () => {
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem(TOKEN_KEY, jwtValido());
        return new Response(JSON.stringify({ erro: "Não autenticado." }), { status: 401 });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await fetchAutenticado("https://api.test/kpis");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("401 genérico com bearer NÃO desloga (evita loga/desloga)", async () => {
    localStorage.setItem(TOKEN_KEY, jwtValido());
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ erro: "Não autenticado.", detalhe: "Authorization Bearer ausente." }), {
        status: 401,
      }),
    );

    await fetchAutenticado("https://api.test/kpis");
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("401 jwt expired com bearer desloga", async () => {
    localStorage.setItem(TOKEN_KEY, jwtValido());
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ erro: "Não autenticado.", detalhe: "jwt expired" }), { status: 401 }),
    );

    await fetchAutenticado("https://api.test/kpis");
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});

describe("fluxo login → kpis", () => {
  it("token persistido é lido na primeira requisição autenticada", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const token = jwtValido();
    localStorage.setItem(TOKEN_KEY, token);

    const res = await fetchAutenticado("https://api.test/api/dashboard/kpis");
    expect(res.status).toBe(200);
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${token}`);

    vi.unstubAllGlobals();
  });
});
