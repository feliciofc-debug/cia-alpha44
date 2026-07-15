/** Injeta Authorization Bearer (JWT próprio), x-api-key interno ou x-demo-auth em dev. */

import { lerTokenArmazenado } from "../auth/token-storage.ts";

export type TokenOptions = { forceRefresh?: boolean };
type TokenFn = (opts?: TokenOptions) => Promise<string | null>;
type SessionExpiredFn = () => void;
export interface AuthFetchOptions {
  forceRefreshToken?: boolean;
}

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
  // Sempre ler armazenamento no instante do envio — evita race entre login e useEffect do provider.
  const armazenado = lerTokenArmazenado();
  if (armazenado && !forceRefresh) return armazenado;

  if (!tokenFn) return armazenado;

  const promessa = tokenFn({ forceRefresh })
    .then((fromFn) => fromFn ?? lerTokenArmazenado())
    .finally(() => {
      if (tokenEmVoo === promessa) tokenEmVoo = null;
    });
  tokenEmVoo = promessa;
  return promessa;
}

async function respostaJwtExpirado(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const txt = await res.clone().text();
    return /expir|expired|jwt|token|não autenticado|nao autenticado|invalid/i.test(txt);
  } catch {
    return false;
  }
}

function aplicarApiKeyInterna(headers: Headers): void {
  const apiKey = import.meta.env.VITE_CIA_API_KEY?.trim();
  if (apiKey) headers.set("x-api-key", apiKey);
}

export async function withAuthHeaders(
  init: RequestInit = {},
  forceRefresh = false,
): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  aplicarApiKeyInterna(headers);

  const token = await obterToken(forceRefresh);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else if (!headers.has("x-api-key") && import.meta.env.DEV) {
    headers.set("x-demo-auth", "1");
  }

  return { ...init, headers };
}

export async function fetchAutenticado(
  url: string,
  init: RequestInit = {},
  opts: AuthFetchOptions = {},
): Promise<Response> {
  const primeira = await withAuthHeaders(init, opts.forceRefreshToken === true);
  let enviouBearer = new Headers(primeira.headers).has("Authorization");
  let res = await fetch(url, primeira);

  // Retry único: token pode ter sido gravado entre o mount do painel e o registro no provider.
  if (res.status === 401 && !enviouBearer && lerTokenArmazenado()) {
    const retryInit = await withAuthHeaders(init, true);
    if (new Headers(retryInit.headers).has("Authorization")) {
      enviouBearer = true;
      res = await fetch(url, retryInit);
    }
  }

  if (res.status === 401 && enviouBearer && (await respostaJwtExpirado(res)) && !sessionExpiredHandled) {
    sessionExpiredHandled = true;
    onSessionExpired?.();
  }
  return res;
}

export async function authFetch(url: string, init: RequestInit = {}, opts: AuthFetchOptions = {}): Promise<Response> {
  return fetchAutenticado(url, init, opts);
}
