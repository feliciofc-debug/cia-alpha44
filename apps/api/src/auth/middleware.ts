/**
 * P4 — Middleware de autenticação (Fastify onRequest).
 *
 * - Rotas públicas (sem auth): /api/health, /api/meta, /api/cambio.
 * - Demais: exigem JWT Clerk válido → anexa req.auth = { userId, tenantSlug, tenantId }.
 * - DEV fallback: se NODE_ENV!=='production' E Clerk não configurado E header
 *   "x-demo-auth: 1" presente → req.auth = tenant "default" (permite dev sem Clerk).
 * - PROD sem CLERK_SECRET_KEY → registrarAuth lança no boot (fail-fast).
 *
 * Uso em server.ts:
 *   import { registrarAuth } from "./auth/middleware.js";
 *   await registrarAuth(app);   // antes das rotas
 */

import type { FastifyInstance, FastifyRequest } from "fastify";
import { verificarToken, clerkConfigurado } from "./clerk.js";
import { resolverTenantSlug, ensureTenant } from "./tenant.js";

export interface AuthContext {
  userId: string;
  tenantSlug: string;
  tenantId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

const ROTAS_PUBLICAS = new Set<string>([
  "/api/health",
  "/api/meta",
  "/api/cambio",
]);

function ehRotaPublica(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return ROTAS_PUBLICAS.has(path);
}

const ehProducao = process.env.NODE_ENV === "production";
const demoFallbackPermitido =
  !ehProducao && !clerkConfigurado() && process.env.AUTH_DEMO_FALLBACK !== "off";

export async function registrarAuth(app: FastifyInstance): Promise<void> {
  if (ehProducao && !clerkConfigurado()) {
    throw new Error(
      "PROD sem CLERK_SECRET_KEY — recusando boot p/ não expor API. " +
        "Defina CLERK_SECRET_KEY em /etc/cia-alpha44/api.env.",
    );
  }

  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (ehRotaPublica(req.url)) return;

    const authHeader = req.headers["authorization"];

    if (demoFallbackPermitido && req.headers["x-demo-auth"] === "1") {
      if (!process.env.DATABASE_URL?.trim()) {
        req.auth = { userId: "demo", tenantSlug: "default", tenantId: "demo-no-db" };
        return;
      }
      const tenantId = await ensureTenant("default", "CIA / Alpha 44 (demo dev)");
      req.auth = { userId: "demo", tenantSlug: "default", tenantId };
      return;
    }

    try {
      const claims = await verificarToken(authHeader);
      const tenantSlug = resolverTenantSlug(claims);
      const tenantId = await ensureTenant(tenantSlug);
      req.auth = { userId: claims.userId, tenantSlug, tenantId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não autenticado.";
      return reply.status(401).send({ erro: "Não autenticado.", detalhe: msg });
    }
  });
}
