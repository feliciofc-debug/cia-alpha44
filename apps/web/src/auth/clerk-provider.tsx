import { ClerkProvider, useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { registerSessionExpiredHandler } from "../lib/auth-fetch.ts";
import { ApiAuthSync } from "./api-auth-sync.tsx";
import type { AuthContextValue, User } from "./types.ts";

const Ctx = createContext<AuthContextValue | null>(null);

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, getToken, signOut } = useClerkAuth();
  const { user: clerkUser } = useUser();

  const user: User | null =
    isSignedIn && clerkUser
      ? {
          nome: clerkUser.fullName || clerkUser.firstName || "Usuário",
          email: clerkUser.primaryEmailAddress?.emailAddress || "",
        }
      : null;

  useEffect(() => {
    registerSessionExpiredHandler(() => {
      void signOut();
    });
    return () => registerSessionExpiredHandler(null);
  }, [signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: "clerk",
      isLoaded,
      user,
      getToken: () => getToken({ skipCache: true }),
      async login() {
        throw new Error("Use a tela de login Clerk");
      },
      async signup() {
        throw new Error("Use a tela de cadastro Clerk");
      },
      logout() {
        void signOut();
      },
    }),
    [isLoaded, user, signOut, getToken],
  );

  return (
    <Ctx.Provider value={value}>
      <ApiAuthSync />
      {children}
    </Ctx.Provider>
  );
}

export function ClerkAuthProvider({ children, publishableKey }: { children: ReactNode; publishableKey: string }) {
  return (
    <ClerkProvider publishableKey={publishableKey} afterSignOutUrl="/">
      <ClerkAuthBridge>{children}</ClerkAuthBridge>
    </ClerkProvider>
  );
}

export function useClerkBridgeAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useClerkBridgeAuth fora do ClerkAuthProvider");
  return ctx;
}
