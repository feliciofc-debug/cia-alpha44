/**
 * JWT próprio — sessão 7 dias, assinado com CIA_JWT_SECRET.
 */

import { SignJWT, jwtVerify } from "jose";

export interface JwtClaims {
  userId: string;
  email: string;
  tenantSlugMeta?: string;
}

const ALG = "HS256";
const VALIDADE_SEGUNDOS = 7 * 24 * 60 * 60;

function secretBytes(): Uint8Array {
  const secret = process.env.CIA_JWT_SECRET?.trim();
  if (!secret) throw new Error("CIA_JWT_SECRET ausente — JWT indisponível.");
  return new TextEncoder().encode(secret);
}

export function jwtConfigurado(): boolean {
  return Boolean(process.env.CIA_JWT_SECRET?.trim());
}

export async function emitirToken(email: string): Promise<string> {
  const normalizado = email.trim().toLowerCase();
  return new SignJWT({ email: normalizado })
    .setProtectedHeader({ alg: ALG })
    .setSubject(normalizado)
    .setIssuedAt()
    .setExpirationTime(`${VALIDADE_SEGUNDOS}s`)
    .sign(secretBytes());
}

export async function verificarToken(authHeader?: string): Promise<JwtClaims> {
  if (!jwtConfigurado()) {
    throw new Error("CIA_JWT_SECRET ausente — verificação JWT indisponível.");
  }
  const m = /^Bearer\s+(.+)$/i.exec(authHeader?.trim() ?? "");
  if (!m) throw new Error("Authorization Bearer ausente.");

  const { payload } = await jwtVerify(m[1]!, secretBytes(), { algorithms: [ALG] });
  const sub = String(payload.sub ?? "").trim().toLowerCase();
  const email =
    typeof payload.email === "string" && payload.email.trim()
      ? payload.email.trim().toLowerCase()
      : sub;
  if (!email) throw new Error("Token sem identificação de usuário.");

  const meta = payload as Record<string, unknown>;
  const tenantSlugMeta =
    typeof meta.tenantSlug === "string" && meta.tenantSlug.trim()
      ? meta.tenantSlug.trim()
      : undefined;

  return { userId: email, email, tenantSlugMeta };
}

/** Testes — emite token já expirado. */
export async function emitirTokenExpirado(email: string): Promise<string> {
  const normalizado = email.trim().toLowerCase();
  return new SignJWT({ email: normalizado })
    .setProtectedHeader({ alg: ALG })
    .setSubject(normalizado)
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
    .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(secretBytes());
}
