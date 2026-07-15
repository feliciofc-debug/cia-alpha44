import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { registerAuthToken, registerSessionExpiredHandler } from "../lib/auth-fetch.ts";
import { apiBaseUrl } from "../lib/api.ts";
import type { AuthContextValue, User } from "./types.ts";

const TOKEN_KEY = "cia_jwt_token";
const USER_KEY = "cia_jwt_user";

function jwtExpirado(token: string): boolean {
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

function lerSessao(): { user: User | null; token: string | null } {
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || jwtExpirado(token)) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { user: null, token: null };
  }
  try {
    const user = JSON.parse(rawUser ?? "") as User;
    if (!user?.email) throw new Error("sessão inválida");
    return { user, token };
  } catch {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    return { user: null, token: null };
  }
}

function persistirSessao(token: string, email: string, nome: string, role?: "admin" | "operador") {
  const user: User = {
    email,
    nome: nome || email.split("@")[0] || email,
    role,
  };
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function JwtAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    const sessao = lerSessao();
    setUser(sessao.user);
    setToken(sessao.token);
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    registerSessionExpiredHandler(() => logout());
    return () => registerSessionExpiredHandler(null);
  }, [logout]);

  useEffect(() => {
    registerAuthToken(async () => token);
    return () => registerAuthToken(null);
  }, [token]);

  const login = useCallback(async (email: string, senha: string) => {
    const res = await fetch(`${apiBaseUrl()}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, senha }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      email?: string;
      nome?: string;
      role?: "admin" | "operador";
      erro?: string;
    };
    if (!res.ok) {
      throw new Error(body.erro || "E-mail ou senha incorretos.");
    }
    if (!body.token || !body.email) {
      throw new Error("Resposta de login inválida.");
    }
    const u = persistirSessao(body.token, body.email, body.nome ?? "", body.role);
    setToken(body.token);
    setUser(u);
  }, []);

  const register = useCallback(async (nome: string, email: string, senha: string) => {
    const res = await fetch(`${apiBaseUrl()}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, email, senha }),
    });
    const body = (await res.json().catch(() => ({}))) as { mensagem?: string; erro?: string };
    if (!res.ok) {
      throw new Error(body.erro || "Não foi possível criar a conta.");
    }
    return body.mensagem || "Cadastro enviado — aguarde aprovação do administrador.";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isLoaded,
      user,
      login,
      register,
      logout,
      getToken: async () => token,
    }),
    [isLoaded, user, login, register, logout, token],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJwtAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useJwtAuth fora do JwtAuthProvider");
  return ctx;
}
