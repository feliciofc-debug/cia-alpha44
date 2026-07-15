/**
 * Middleware de autenticação (Fastify onRequest).
 *
 * - Rotas públicas: /api/health, /api/meta, /api/cambio, /api/auth/login.
 * - Protegidas: x-api-key=CIA_API_KEY (integrações) OU Bearer JWT próprio válido.
 * - DEV: x-demo-auth:1 quando JWT/api-key ausentes e AUTH_DEMO_FALLBACK≠off.
 */

import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { verificarToken, jwtConfigurado } from "./jwt.js";
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
  "/api/auth/login",
]);

function ehRotaPublica(url: string): boolean {
  const path = url.split("?")[0] ?? url;
  return ROTAS_PUBLICAS.has(path);
}

const ehProducao = process.env.NODE_ENV === "production";
const demoFallbackPermitido =
  !ehProducao && !jwtConfigurado() && process.env.AUTH_DEMO_FALLBACK !== "off";

function apiKeyConfigurada(): string {
  return process.env.CIA_API_KEY?.trim() ?? "";
}

function headerUnico(valor: string | string[] | undefined): string {
  return Array.isArray(valor) ? (valor[0] ?? "") : (valor ?? "");
}

function apiKeyValida(headerApiKey: string | string[] | undefined): boolean {
  const esperado = apiKeyConfigurada();
  const recebido = headerUnico(headerApiKey).trim();
  if (!esperado || !recebido) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

function tenantSlugApiKey(): string {
  return process.env.CIA_API_TENANT_SLUG?.trim() || "default";
}

function motivoRejeicaoJwt(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "erro desconhecido");
  if (/expir|expired|jwt expired|token expired/i.test(msg)) return "expired";
  if (/signature|assinatura/i.test(msg)) return "invalid signature";
  if (/bearer|authorization/i.test(msg)) return "missing bearer";
  if (/CIA_JWT_SECRET/i.test(msg)) return "jwt secret missing";
  return msg;
}

export async function registrarAuth(app: FastifyInstance): Promise<void> {
  if (ehProducao && !jwtConfigurado() && !apiKeyConfigurada()) {
    throw new Error(
      "PROD sem CIA_JWT_SECRET nem CIA_API_KEY — recusando boot. " +
        "Defina credenciais em /etc/cia-alpha44/api.env.",
    );
  }

  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (ehRotaPublica(req.url)) return;

    if (apiKeyValida(req.headers["x-api-key"])) {
      const slug = tenantSlugApiKey();
      const tenantId = await ensureTenant(slug, "CIA / Alpha 44 (apikey)");
      req.auth = { userId: "apikey", tenantSlug: slug, tenantId };
      return;
    }

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
      const claims = await verificarToken(req.headers.authorization);
      const tenantSlug = resolverTenantSlug(claims);
      const tenantId = await ensureTenant(tenantSlug);
      req.auth = { userId: claims.userId, tenantSlug, tenantId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não autenticado.";
      req.log.warn({ motivo: motivoRejeicaoJwt(e), path: req.url.split("?")[0] }, "[auth] JWT rejeitado");
      return reply.status(401).send({ erro: "Não autenticado.", detalhe: msg });
    }
  });
}
