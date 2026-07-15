/** Armazenamento do JWT — leitura síncrona no momento de cada requisição. */

export const TOKEN_KEY = "cia_jwt_token";
export const USER_KEY = "cia_jwt_user";

function decodeJwtPayload(token: string): { exp?: number } | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = atob(padded);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
}

export function jwtExpirado(token: string): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return payload.exp * 1000 <= Date.now();
}

/** Lê o token persistido (localStorage) no instante da chamada — evita race pós-login. */
export function lerTokenArmazenado(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY)?.trim();
    if (!token) return null;
    if (jwtExpirado(token)) {
      limparToken();
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function persistirToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
}

export function limparToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
