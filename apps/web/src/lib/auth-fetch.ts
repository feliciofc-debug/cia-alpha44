/** Injeta Authorization Bearer (Clerk) ou x-demo-auth em dev. */

type TokenFn = () => Promise<string | null>;
type SessionExpiredFn = () => void;

let tokenFn: TokenFn | null = null;
let onSessionExpired: SessionExpiredFn | null = null;

export function registerAuthToken(fn: TokenFn | null) {
  tokenFn = fn;
}

export function registerSessionExpiredHandler(fn: SessionExpiredFn | null) {
  onSessionExpired = fn;
}

async function respostaJwtExpirado(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const txt = await res.clone().text();
    return /jwt is expired|token expired|expirad/i.test(txt);
  } catch {
    return false;
  }
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
    const expirado = await respostaJwtExpirado(res);
    await new Promise((r) => setTimeout(r, 150));
    res = await fetch(url, await withAuthHeaders(init));
    if (res.status === 401 && (expirado || (await respostaJwtExpirado(res)))) {
      onSessionExpired?.();
    }
  }
  return res;
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetchAutenticado(url, init);
}
