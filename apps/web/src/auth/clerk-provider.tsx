import { ClerkProvider, useAuth as useClerkAuth, useUser } from "@clerk/clerk-react";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AuthContextValue, User } from "./types.ts";

const Ctx = createContext<AuthContextValue | null>(null);

function ClerkAuthBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { user: clerkUser } = useUser();
  const { signOut } = useClerkAuth();

  const user: User | null =
    isSignedIn && clerkUser
      ? {
          nome: clerkUser.fullName || clerkUser.firstName || "Usuário",
          email: clerkUser.primaryEmailAddress?.emailAddress || "",
        }
      : null;

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: "clerk",
      isLoaded,
      user,
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
    [isLoaded, user, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
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
