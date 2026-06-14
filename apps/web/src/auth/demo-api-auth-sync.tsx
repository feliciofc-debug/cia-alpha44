import { useEffect } from "react";
import { registerAuthToken } from "../lib/auth-fetch.ts";

/** Dev demo: sem JWT; api.ts envia x-demo-auth: 1. */
export function DemoApiAuthSync() {
  useEffect(() => {
    registerAuthToken(async () => null);
    return () => registerAuthToken(null);
  }, []);
  return null;
}
