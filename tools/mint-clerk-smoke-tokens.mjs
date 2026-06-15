#!/usr/bin/env node
/**
 * Emite JWTs Clerk para smoke em prod (VPS: source /etc/cia-alpha44/api.env).
 * Uso: node tools/mint-clerk-smoke-tokens.mjs [--json-full]
 */
import { createClerkClient } from "@clerk/backend";

const secret = process.env.CLERK_SECRET_KEY?.trim();
if (!secret) {
  console.error("CLERK_SECRET_KEY ausente");
  process.exit(2);
}

const clerk = createClerkClient({ secretKey: secret });
const users = await clerk.users.getUserList({ limit: 20 });
const out = [];

for (const u of users.data) {
  const email = u.emailAddresses[0]?.emailAddress ?? u.id;
  const tenantSlug =
    typeof u.publicMetadata?.tenantSlug === "string" && u.publicMetadata.tenantSlug.trim()
      ? u.publicMetadata.tenantSlug.trim()
      : `user_${u.id}`;

  const sessions = await clerk.sessions.getSessionList({ userId: u.id, status: "active", limit: 1 });
  let sessionId = sessions.data[0]?.id;
  if (!sessionId) {
    const created = await clerk.sessions.createSession({ userId: u.id });
    sessionId = created.id;
  }
  const res = await clerk.sessions.getToken(sessionId, undefined, 3600);
  const token = typeof res === "string" ? res : res.jwt;
  out.push({ email, tenantSlug, userId: u.id, token });
}

if (process.argv.includes("--json-full")) {
  console.log(JSON.stringify({ count: out.length, tokens: out }));
} else {
  console.log(
    JSON.stringify({
      count: out.length,
      tokens: out.map((t) => ({ email: t.email, tenantSlug: t.tenantSlug, userId: t.userId })),
    }),
  );
}
