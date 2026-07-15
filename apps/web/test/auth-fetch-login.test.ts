import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TOKEN_KEY } from "../src/auth/token-storage.ts";
import {
  fetchAutenticado,
  registerAuthToken,
  registerSessionExpiredHandler,
  withAuthHeaders,
} from "../src/lib/auth-fetch.ts";

function jwtValido(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `hdr.${payload}.sig`;
}

describe("auth-fetch — bearer após login (race pós-mount)", () => {
  const fetchMock = vi.fn();
  const onExpired = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    localStorage.clear();
    registerSessionExpiredHandler(onExpired);
    registerAuthToken(async () => null);
    fetchMock.mockReset();
    onExpired.mockReset();
  });

  afterEach(() => {
    registerAuthToken(null);
    registerSessionExpiredHandler(null);
    vi.unstubAllGlobals();
  });

  it("withAuthHeaders lê token do localStorage mesmo com tokenFn null (simula race pós-login)", async () => {
    localStorage.setItem(TOKEN_KEY, jwtValido());
    registerAuthToken(async () => null);

    const init = await withAuthHeaders({});
    const auth = new Headers(init.headers).get("Authorization");
    expect(auth).toMatch(/^Bearer /);
  });

  it("fetchAutenticado faz retry quando 401 sem bearer e token gravado antes do retry", async () => {
    fetchMock
      .mockImplementationOnce(async () => {
        localStorage.setItem(TOKEN_KEY, jwtValido());
        return new Response(JSON.stringify({ erro: "missing bearer" }), { status: 401 });
      })
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    registerAuthToken(async () => null);

    const res = await fetchAutenticado("https://api.test/kpis");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const segunda = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(segunda.headers).get("Authorization")).toMatch(/^Bearer /);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("401 com bearer inválido dispara logout de sessão", async () => {
    localStorage.setItem(TOKEN_KEY, jwtValido());
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ erro: "jwt expired" }), { status: 401 }),
    );

    await fetchAutenticado("https://api.test/kpis");
    expect(onExpired).toHaveBeenCalledTimes(1);
  });
});
