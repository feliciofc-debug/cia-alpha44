/** Commit curto embutido no build Vercel — confirme na UI se o bundle é recente. */
export const BUILD_SHA = (import.meta.env.VITE_BUILD_SHA as string | undefined)?.trim() || "local";
