/**
 * P4 — Rate limit por tenant (ou IP em rotas públicas).
 */

import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";

function maxFromEnv(key: string, fallback: number): number {
  const v = process.env[key]?.trim();
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function rateLimitKey(req: FastifyRequest): string {
  return req.auth?.tenantSlug ?? req.ip;
}

export const RL_CLASSIFICAR_MAX = () => maxFromEnv("RL_CLASSIFICAR_MAX", 30);
export const RL_PARSE_MAX = () => maxFromEnv("RL_PARSE_MAX", 30);
export const RL_NCM_CONFERIR_MAX = () => maxFromEnv("RL_NCM_CONFERIR_MAX", 120);

const STRICT = {
  max: RL_CLASSIFICAR_MAX(),
  timeWindow: "1 hour" as const,
  keyGenerator: rateLimitKey,
};

const MEDIUM = {
  max: RL_NCM_CONFERIR_MAX(),
  timeWindow: "1 hour" as const,
  keyGenerator: rateLimitKey,
};

export async function registrarRateLimit(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, { global: false, hook: "preHandler" });
}

export function rateLimitClassificar() {
  return { ...STRICT, max: RL_CLASSIFICAR_MAX() };
}

export function rateLimitParse() {
  return { ...STRICT, max: RL_PARSE_MAX() };
}

export function rateLimitNcmConferir() {
  return { ...MEDIUM, max: RL_NCM_CONFERIR_MAX() };
}
