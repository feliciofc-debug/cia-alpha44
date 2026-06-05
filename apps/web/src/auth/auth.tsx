import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Auth de demonstração (persistida em localStorage).
 * Credenciais fixas para testes — trocar por Clerk antes de entregar ao cliente.
 */

/** Login de demonstração (pode sobrescrever via Vercel env no build). */
const DEMO_EMAIL = (import.meta.env.VITE_DEMO_EMAIL as string) || "demo@cia-alpha44.com.br";
const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string) || "CiaAlpha44!";

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
      async login(email, senha) {
        if (email.trim().toLowerCase() !== DEMO_EMAIL.toLowerCase() || senha !== DEMO_PASSWORD) {
          throw new Error("Credenciais inválidas");
        }
        const u: User = { nome: "Demonstração CIA", email: DEMO_EMAIL };
        localStorage.setItem(KEY, JSON.stringify(u));
        setUser(u);
      },
      async signup(_nome, email, senha) {
        // Cadastro desabilitado em demo — use as credenciais de teste.
        await (async () => {
          if (email.trim().toLowerCase() !== DEMO_EMAIL.toLowerCase() || senha !== DEMO_PASSWORD) {
            throw new Error("Credenciais inválidas");
          }
        })();
        const u: User = { nome: "Demonstração CIA", email: DEMO_EMAIL };
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
