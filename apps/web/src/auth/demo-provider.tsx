import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthContextValue, User } from "./types.ts";

const DEMO_EMAIL = (import.meta.env.VITE_DEMO_EMAIL as string) || "demo@cia-alpha44.com.br";
const DEMO_PASSWORD = (import.meta.env.VITE_DEMO_PASSWORD as string) || "CiaAlpha44!";

const Ctx = createContext<AuthContextValue | null>(null);
const KEY = "cia_user";

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try {
        setUser(JSON.parse(raw) as User);
      } catch {
        /* ignore */
      }
    }
    setIsLoaded(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: "demo",
      isLoaded,
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
    [user, isLoaded],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDemoAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDemoAuth fora do DemoAuthProvider");
  return ctx;
}
