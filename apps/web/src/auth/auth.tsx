import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Auth de demonstração (persistida em localStorage).
 * Estrutura isolada para troca futura por Clerk / Auth.js sem mexer nas telas.
 */

export interface User {
  nome: string;
  email: string;
}

interface AuthCtx {
  user: User | null;
  login: (email: string, senha: string) => Promise<void>;
  signup: (nome: string, email: string, senha: string) => Promise<void>;
  logout: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const KEY = "cia_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      async login(email) {
        const u: User = { nome: email.split("@")[0] || "Operador", email };
        localStorage.setItem(KEY, JSON.stringify(u));
        setUser(u);
      },
      async signup(nome, email) {
        const u: User = { nome, email };
        localStorage.setItem(KEY, JSON.stringify(u));
        setUser(u);
      },
      logout() {
        localStorage.removeItem(KEY);
        setUser(null);
      },
    }),
    [user],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth fora do AuthProvider");
  return ctx;
}
