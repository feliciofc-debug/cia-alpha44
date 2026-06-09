/** HTTP autenticado ao Portal Único Siscomex. */

import { autenticarPortalUnico, atualizarSessaoDosHeaders, portalRequest } from "./auth.js";
import { baseUrlPortalUnico, lerConfigSiscomex } from "./config.js";

export async function portalFetchJson<T>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const config = lerConfigSiscomex();
  const base = baseUrlPortalUnico(config.ambiente);
  const session = await autenticarPortalUnico();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await portalRequest(url, {
    method: opts.method ?? (opts.body != null ? "POST" : "GET"),
    headers: {
      Authorization: session.authorization,
      "X-CSRF-Token": session.csrfToken,
      Accept: "application/json",
      ...(opts.body != null ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });

  atualizarSessaoDosHeaders(res.headers);

  if (res.status === 204) return {} as T;

  if (res.status < 200 || res.status >= 300) {
    let msg = `Portal Único ${opts.method ?? "GET"} ${path} → HTTP ${res.status}`;
    try {
      const err = JSON.parse(res.body) as { message?: string; code?: string };
      if (err.message) msg += `: ${err.message}`;
    } catch {
      if (res.body) msg += `: ${res.body.slice(0, 300)}`;
    }
    throw new Error(msg);
  }

  if (!res.body.trim()) return {} as T;
  return JSON.parse(res.body) as T;
}
