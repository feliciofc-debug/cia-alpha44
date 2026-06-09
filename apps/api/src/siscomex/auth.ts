/** Autenticação Portal Único — mTLS (certificado A1) + JWT/CSRF. */

import https from "node:https";
import fs from "node:fs";
import { baseUrlPortalUnico, lerConfigSiscomex } from "./config.js";

export interface PortalSession {
  authorization: string;
  csrfToken: string;
  expiresAt: number;
}

let cachedAgent: https.Agent | null = null;
let cachedSession: PortalSession | null = null;

function certPath(): string {
  const p = process.env.SISCOMEX_CERT_PATH?.trim();
  if (!p) throw new Error("SISCOMEX_CERT_PATH não configurado.");
  return p;
}

function certPassword(): string {
  const p = process.env.SISCOMEX_CERT_PASSWORD?.trim();
  if (!p) throw new Error("SISCOMEX_CERT_PASSWORD não configurado.");
  return p;
}

export function roleType(): string {
  return process.env.SISCOMEX_ROLE_TYPE?.trim() || "IMPEXP";
}

export function getHttpsAgent(): https.Agent {
  if (cachedAgent) return cachedAgent;
  const pfx = fs.readFileSync(certPath());
  cachedAgent = new https.Agent({
    pfx,
    passphrase: certPassword(),
    rejectUnauthorized: true,
    keepAlive: true,
    maxSockets: 4,
  });
  return cachedAgent;
}

function headerGet(headers: Record<string, string | string[] | undefined>, name: string): string | null {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  if (!key) return null;
  const v = headers[key];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

/** Requisição HTTPS com certificado cliente (mTLS). */
export function portalRequest(
  url: string,
  opts: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: opts.method ?? "GET",
        headers: opts.headers,
        agent: getHttpsAgent(),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

/** POST /portal/api/autenticar — obtém JWT + CSRF (válido ~60 min). */
export async function autenticarPortalUnico(force = false): Promise<PortalSession> {
  const now = Date.now();
  if (!force && cachedSession && cachedSession.expiresAt > now + 60_000) {
    return cachedSession;
  }

  const config = lerConfigSiscomex();
  const base = baseUrlPortalUnico(config.ambiente);
  const res = await portalRequest(`${base}/portal/api/autenticar`, {
    method: "POST",
    headers: {
      "Role-Type": roleType(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: "{}",
  });

  if (res.status < 200 || res.status >= 300) {
    let msg = `Autenticação Siscomex HTTP ${res.status}`;
    try {
      const err = JSON.parse(res.body) as { message?: string; code?: string };
      if (err.message) msg += `: ${err.message}`;
      if (err.code) msg += ` (${err.code})`;
    } catch {
      if (res.body) msg += `: ${res.body.slice(0, 200)}`;
    }
    throw new Error(msg);
  }

  const authorization = headerGet(res.headers, "set-token");
  const csrfToken = headerGet(res.headers, "x-csrf-token");
  const expiration = headerGet(res.headers, "x-csrf-expiration");

  if (!authorization || !csrfToken) {
    throw new Error("Autenticação Siscomex OK mas sem Set-Token ou X-CSRF-Token nos headers.");
  }

  cachedSession = {
    authorization,
    csrfToken,
    expiresAt: expiration ? Number(expiration) : now + 55 * 60_000,
  };
  return cachedSession;
}

/** Atualiza CSRF a partir de headers de resposta (renovação automática). */
export function atualizarSessaoDosHeaders(headers: Record<string, string | string[] | undefined>): void {
  if (!cachedSession) return;
  const csrf = headerGet(headers, "x-csrf-token");
  const exp = headerGet(headers, "x-csrf-expiration");
  if (csrf) cachedSession.csrfToken = csrf;
  if (exp) cachedSession.expiresAt = Number(exp);
}

export function limparSessaoPortal(): void {
  cachedSession = null;
}
