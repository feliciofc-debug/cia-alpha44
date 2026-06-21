import { useEffect } from "react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { registerAuthToken } from "../lib/auth-fetch.ts";

/** Sincroniza getToken() do Clerk com o client HTTP da API. */
export function ApiAuthSync() {
  const { isLoaded, isSignedIn, getToken } = useClerkAuth();

  useEffect(() => {
    if (!isLoaded) return;
    registerAuthToken(async (opts) => {
      if (!isSignedIn) return null;
      return getToken(opts?.forceRefresh ? { skipCache: true } : undefined);
    });
    return () => registerAuthToken(null);
  }, [isLoaded, isSignedIn, getToken]);

  return null;
}
