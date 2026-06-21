/** Injeta Authorization Bearer (Clerk) ou x-demo-auth em dev. */

type TokenFn = () => Promise<string | null>;

let tokenFn: TokenFn | null = null;

export function registerAuthToken(fn: TokenFn | null) {
  tokenFn = fn;
}

export async function withAuthHeaders(init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers);

  if (tokenFn) {
    const token = await tokenFn();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    } else if (import.meta.env.DEV) {
      headers.set("x-demo-auth", "1");
    }
  } else if (import.meta.env.DEV) {
    headers.set("x-demo-auth", "1");
  }

  return { ...init, headers };
}

export async function fetchAutenticado(url: string, init: RequestInit = {}): Promise<Response> {
  let res = await fetch(url, await withAuthHeaders(init));
  if (res.status === 401 && tokenFn) {
    res = await fetch(url, await withAuthHeaders(init));
  }
  return res;
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetchAutenticado(url, init);
}
