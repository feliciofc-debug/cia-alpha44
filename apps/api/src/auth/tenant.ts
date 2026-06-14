/**
 * P4 — Resolução de tenant a partir dos claims Clerk (user→tenant).
 *
 * Slug híbrido (decisão travada):
 *   1) Se claims.tenantSlugMeta (publicMetadata.tenantSlug) existir → usa esse.
 *   2) Senão → "user_" + userId.
 *
 * ensureTenant faz upsert idempotente: cria o Tenant na 1ª vez que o usuário
 * acessa, reusa nas seguintes. O tenant "default" (seed) continua válido p/ as
 * cotações smoke antigas.
 */

import { prisma } from "@cia/db";
import type { ClerkClaims } from "./clerk.js";

export function resolverTenantSlug(claims: ClerkClaims): string {
  if (claims.tenantSlugMeta) return claims.tenantSlugMeta;
  return `user_${claims.userId}`;
}

/** Garante que o Tenant existe; retorna o id. Idempotente. */
export async function ensureTenant(slug: string, nomeSugerido?: string): Promise<string> {
  const t = await prisma.tenant.upsert({
    where: { slug },
    update: {},
    create: { slug, nome: nomeSugerido ?? slug },
  });
  return t.id;
}
