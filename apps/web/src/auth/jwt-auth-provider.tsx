import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { registerAuthToken, registerSessionExpiredHandler } from "../lib/auth-fetch.ts";
import { apiBaseUrl } from "../lib/api.ts";
import {
  lerTokenArmazenado,
  limparToken,
  persistirToken,
  USER_KEY,
} from "./token-storage.ts";
import type { AuthContextValue, User } from "./types.ts";

function lerSessao(): { user: User | null; token: string | null } {
  const token = lerTokenArmazenado();
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token) {
    return { user: null, token: null };
  }
  try {
    const user = JSON.parse(rawUser ?? "") as User;
    if (!user?.email) throw new Error("sessão inválida");
    return { user, token };
  } catch {
    limparToken();
    return { user: null, token: null };
  }
}

function persistirSessao(token: string, email: string, nome: string, role?: "admin" | "operador") {
  const user: User = {
    email,
    nome: nome || email.split("@")[0] || email,
    role,
  };
  persistirToken(token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

const Ctx = createContext<AuthContextValue | null>(null);

export function JwtAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const logout = useCallback(() => {
    limparToken();
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
    registerAuthToken(async () => lerTokenArmazenado());
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
    // Garante que o próximo fetch já enxerga o token (antes do re-render/useEffect).
    registerAuthToken(async () => body.token ?? lerTokenArmazenado());
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
      getToken: async () => lerTokenArmazenado(),
    }),
    [isLoaded, user, login, register, logout],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJwtAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useJwtAuth fora do JwtAuthProvider");
  return ctx;
}
