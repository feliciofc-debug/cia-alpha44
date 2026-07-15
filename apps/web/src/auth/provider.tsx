import type { ReactNode } from "react";
import { JwtAuthProvider, useJwtAuth } from "./jwt-auth-provider.tsx";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <JwtAuthProvider>{children}</JwtAuthProvider>;
}

export function useAuth() {
  return useJwtAuth();
}
