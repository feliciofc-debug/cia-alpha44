import type { ReactNode } from "react";
import { ClerkAuthProvider, useClerkBridgeAuth } from "./clerk-provider.tsx";
import { DemoAuthProvider, useDemoAuth } from "./demo-provider.tsx";

const CLERK_KEY = (import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string)?.trim() || "";

export function AuthProvider({ children }: { children: ReactNode }) {
  if (CLERK_KEY) {
    return <ClerkAuthProvider publishableKey={CLERK_KEY}>{children}</ClerkAuthProvider>;
  }
  return <DemoAuthProvider>{children}</DemoAuthProvider>;
}

export function useAuth() {
  if (CLERK_KEY) return useClerkBridgeAuth();
  return useDemoAuth();
}

export function authUsaClerk(): boolean {
  return Boolean(CLERK_KEY);
}
