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

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, await withAuthHeaders(init));
}
