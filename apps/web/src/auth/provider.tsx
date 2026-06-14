import type { ReactNode } from "react";
import { ClerkAuthProvider, useClerkBridgeAuth } from "./clerk-provider.tsx";
import { DemoAuthProvider, useDemoAuth } from "./demo-provider.tsx";

const CLERK_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string)?.trim() || "";

function ClerkRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-center text-slate-200">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-semibold">Autenticação obrigatória</h1>
        <p className="text-sm text-slate-400">
          Configure <code className="text-amber-300">VITE_CLERK_PUBLISHABLE_KEY</code> no ambiente de produção.
          Login demo só está disponível em desenvolvimento.
        </p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  if (CLERK_KEY) {
    return <ClerkAuthProvider publishableKey={CLERK_KEY}>{children}</ClerkAuthProvider>;
  }
  if (import.meta.env.DEV) {
    return <DemoAuthProvider>{children}</DemoAuthProvider>;
  }
  return <ClerkRequired />;
}

export function useAuth() {
  if (CLERK_KEY) return useClerkBridgeAuth();
  if (import.meta.env.DEV) return useDemoAuth();
  throw new Error("Auth indisponível — configure Clerk em produção.");
}

export function authUsaClerk(): boolean {
  return Boolean(CLERK_KEY);
}
