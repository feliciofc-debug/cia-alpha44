/** Injeta Authorization Bearer (JWT próprio), x-api-key interno ou x-demo-auth em dev. */

import { lerTokenArmazenado } from "../auth/token-storage.ts";

type SessionExpiredFn = () => void;
export interface AuthFetchOptions {
  /** Ignorado — JWT próprio sempre lê localStorage no envio. Mantido por compat. */
  forceRefreshToken?: boolean;
}

let onSessionExpired: SessionExpiredFn | null = null;
let sessionExpiredHandled = false;

export function registerAuthToken(_fn: unknown): void {
  /* noop — JWT próprio usa só localStorage; evita race do closure React. */
  sessionExpiredHandled = false;
}

export function registerSessionExpiredHandler(fn: SessionExpiredFn | null) {
  onSessionExpired = fn;
  if (fn) sessionExpiredHandled = false;
}

async function respostaDeveDeslogar(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const txt = await res.clone().text();
    // Só desloga em sessão claramente inválida — NÃO em 401 genérico "Não autenticado."
    return /expir|expired|invalid signature|assinatura|jwt secret|malformed/i.test(txt);
  } catch {
    return false;
  }
}

function aplicarApiKeyInterna(headers: Headers): void {
  const apiKey = import.meta.env.VITE_CIA_API_KEY?.trim();
  if (apiKey) headers.set("x-api-key", apiKey);
}

export async function withAuthHeaders(init: RequestInit = {}): Promise<RequestInit> {
  const headers = new Headers(init.headers);
  aplicarApiKeyInterna(headers);

  const token = lerTokenArmazenado();
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
  _opts: AuthFetchOptions = {},
): Promise<Response> {
  const primeira = await withAuthHeaders(init);
  let enviouBearer = new Headers(primeira.headers).has("Authorization");
  let res = await fetch(url, primeira);

  // Retry único: token gravado no login no mesmo tick do mount do painel.
  if (res.status === 401 && !enviouBearer) {
    const token = lerTokenArmazenado();
    if (token) {
      const retryInit = await withAuthHeaders(init);
      if (new Headers(retryInit.headers).has("Authorization")) {
        enviouBearer = true;
        res = await fetch(url, retryInit);
      }
    }
  }

  if (res.status === 401 && enviouBearer && (await respostaDeveDeslogar(res)) && !sessionExpiredHandled) {
    sessionExpiredHandled = true;
    onSessionExpired?.();
  }
  return res;
}

export async function authFetch(url: string, init: RequestInit = {}, opts: AuthFetchOptions = {}): Promise<Response> {
  return fetchAutenticado(url, init, opts);
}
