import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/tenant.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/tenant.js")>();
  return {
    ...actual,
    ensureTenant: vi.fn(async (slug: string) => `tid-${slug}`),
  };
});

describe("registrarAuth middleware", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = { ...envBackup, NODE_ENV: "development", CLERK_SECRET_KEY: "" };
    delete process.env.AUTH_DEMO_FALLBACK;
  });

  afterEach(() => {
    process.env = envBackup;
    vi.resetModules();
  });

  it("rotas públicas não exigem auth", async () => {
    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/health", async () => ({ ok: true }));
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("rota protegida sem auth → 401", async () => {
    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/cotacoes", async () => ({ cotacoes: [] }));
    const res = await app.inject({ method: "GET", url: "/api/cotacoes" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("dev x-demo-auth:1 passa com tenant default", async () => {
    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/cotacoes", async (req) => ({ tenant: req.auth?.tenantSlug }));
    const res = await app.inject({
      method: "GET",
      url: "/api/cotacoes",
      headers: { "x-demo-auth": "1" },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).tenant).toBe("default");
    await app.close();
  });
});
