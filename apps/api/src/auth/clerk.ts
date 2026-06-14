/**
 * P4 — Verificação de JWT Clerk (back).
 *
 * Usa @clerk/backend (verifyToken), que resolve o JWKS automaticamente a partir
 * do CLERK_SECRET_KEY. Issuer padrão clerk.accounts.dev (sem domínio custom).
 *
 * Retorna os claims relevantes pro isolamento de tenant. Lança em token inválido
 * — o middleware traduz isso em 401.
 */

import { verifyToken } from "@clerk/backend";

export interface ClerkClaims {
  /** Clerk user id (claim "sub"). */
  userId: string;
  /** publicMetadata.tenantSlug, se o app Clerk setar. Senão undefined. */
  tenantSlugMeta?: string;
}

const SECRET = process.env.CLERK_SECRET_KEY?.trim() || "";

export function clerkConfigurado(): boolean {
  return SECRET.length > 0;
}

/**
 * Verifica o header Authorization e devolve os claims.
 * Lança Error se ausente/inválido (middleware → 401).
 */
export async function verificarToken(authHeader?: string): Promise<ClerkClaims> {
  if (!SECRET) {
    throw new Error("CLERK_SECRET_KEY ausente — verificação JWT indisponível.");
  }
  const m = /^Bearer\s+(.+)$/i.exec(authHeader?.trim() ?? "");
  if (!m) {
    throw new Error("Authorization Bearer ausente.");
  }
  const token = m[1]!;

  const payload = await verifyToken(token, { secretKey: SECRET });
  const sub = String(payload.sub ?? "");
  if (!sub) throw new Error("Token sem claim sub.");

  const meta = (payload as Record<string, unknown>)["publicMetadata"] as
    | { tenantSlug?: unknown }
    | undefined;
  const tenantSlugMeta =
    meta && typeof meta.tenantSlug === "string" && meta.tenantSlug.trim()
      ? meta.tenantSlug.trim()
      : undefined;

  return { userId: sub, tenantSlugMeta };
}
