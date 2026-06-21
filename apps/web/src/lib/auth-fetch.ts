/** Injeta Authorization Bearer (Clerk) ou x-demo-auth em dev. */

export type TokenOptions = { forceRefresh?: boolean };
type TokenFn = (opts?: TokenOptions) => Promise<string | null>;
type SessionExpiredFn = () => void;

let tokenFn: TokenFn | null = null;
let onSessionExpired: SessionExpiredFn | null = null;
let sessionExpiredHandled = false;
let tokenEmVoo: Promise<string | null> | null = null;

export function registerAuthToken(fn: TokenFn | null) {
  tokenFn = fn;
  tokenEmVoo = null;
  sessionExpiredHandled = false;
}

export function registerSessionExpiredHandler(fn: SessionExpiredFn | null) {
  onSessionExpired = fn;
  if (fn) sessionExpiredHandled = false;
}

async function obterToken(forceRefresh = false): Promise<string | null> {
  if (!tokenFn) return null;
  if (!forceRefresh && tokenEmVoo) return tokenEmVoo;

  const promessa = tokenFn({ forceRefresh }).finally(() => {
    if (tokenEmVoo === promessa) tokenEmVoo = null;
  });
  tokenEmVoo = promessa;
  return promessa;
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

export async function withAuthHeaders(
  init: RequestInit = {},
  forceRefresh = false,
): Promise<RequestInit> {
  const headers = new Headers(init.headers);

  if (tokenFn) {
    const token = await obterToken(forceRefresh);
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
    res = await fetch(url, await withAuthHeaders(init, true));
    if (res.status === 401 && (expirado || (await respostaJwtExpirado(res)))) {
      if (!sessionExpiredHandled) {
        sessionExpiredHandled = true;
        onSessionExpired?.();
      }
    }
  }
  return res;
}

export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetchAutenticado(url, init);
}
