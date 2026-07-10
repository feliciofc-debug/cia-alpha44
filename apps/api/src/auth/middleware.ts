/**
 * P4 — Middleware de autenticação (Fastify onRequest).
 *
 * - Rotas públicas (sem auth): /api/health, /api/meta, /api/cambio.
 * - Demais: exigem JWT Clerk válido → anexa req.auth = { userId, tenantSlug, tenantId }.
 * - Emergência: AUTH_MODE=apikey aceita x-api-key=CIA_API_KEY nas rotas protegidas,
 *   mantendo Clerk como comportamento padrão quando o modo não está ativo.
 * - DEV fallback: se NODE_ENV!=='production' E Clerk não configurado E header
 *   "x-demo-auth: 1" presente → req.auth = tenant "default" (permite dev sem Clerk).
 * - PROD sem CLERK_SECRET_KEY → registrarAuth lança no boot (fail-fast).
 *
 * Uso em server.ts:
 *   import { registrarAuth } from "./auth/middleware.js";
 *   await registrarAuth(app);   // antes das rotas
 */

import { timingSafeEqual } from "node:crypto";
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

function authModeApiKey(): boolean {
  return process.env.AUTH_MODE?.trim().toLowerCase() === "apikey";
}

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

function motivoRejeicaoClerk(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "erro desconhecido");
  if (/expir|expired|jwt is expired|token expired/i.test(msg)) return "expired";
  if (/signature|assinatura/i.test(msg)) return "invalid signature";
  if (/\bazp\b|authorized party/i.test(msg)) return "azp";
  if (/bearer|authorization/i.test(msg)) return "missing bearer";
  if (/secret|CLERK_SECRET_KEY/i.test(msg)) return "clerk secret missing";
  return msg;
}

export async function registrarAuth(app: FastifyInstance): Promise<void> {
  if (authModeApiKey() && !apiKeyConfigurada()) {
    throw new Error("AUTH_MODE=apikey sem CIA_API_KEY — recusando boot para não expor API.");
  }

  if (ehProducao && !authModeApiKey() && !clerkConfigurado()) {
    throw new Error(
      "PROD sem CLERK_SECRET_KEY — recusando boot p/ não expor API. " +
        "Defina CLERK_SECRET_KEY em /etc/cia-alpha44/api.env.",
    );
  }

  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (ehRotaPublica(req.url)) return;

    const authHeader = req.headers["authorization"];

    if (authModeApiKey()) {
      if (!apiKeyValida(req.headers["x-api-key"])) {
        return reply.status(401).send({ erro: "Não autenticado.", detalhe: "x-api-key ausente ou inválida." });
      }
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
      const claims = await verificarToken(authHeader);
      const tenantSlug = resolverTenantSlug(claims);
      const tenantId = await ensureTenant(tenantSlug);
      req.auth = { userId: claims.userId, tenantSlug, tenantId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não autenticado.";
      req.log.warn({ motivo: motivoRejeicaoClerk(e), path: req.url.split("?")[0] }, "[auth] Clerk token rejeitado");
      return reply.status(401).send({ erro: "Não autenticado.", detalhe: msg });
    }
  });
}
