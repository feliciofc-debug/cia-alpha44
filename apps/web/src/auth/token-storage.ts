/** Armazenamento do JWT — leitura síncrona no momento de cada requisição. */

export const TOKEN_KEY = "cia_jwt_token";
export const USER_KEY = "cia_jwt_user";

export function jwtExpirado(token: string): boolean {
  try {
    const part = token.split(".")[1];
    if (!part) return true;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" && payload.exp * 1000 <= Date.now();
  } catch {
    return true;
  }
}

/** Lê o token persistido (localStorage) no instante da chamada — evita race pós-login. */
export function lerTokenArmazenado(): string | null {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || jwtExpirado(token)) {
      if (token) {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function persistirToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function limparToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
