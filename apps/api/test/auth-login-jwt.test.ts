import Fastify from "fastify";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitirToken, emitirTokenExpirado } from "../src/auth/jwt.js";

vi.mock("../src/auth/tenant.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/tenant.js")>();
  return {
    ...actual,
    ensureTenant: vi.fn(async (slug: string) => `tid-${slug}`),
  };
});

describe("POST /api/auth/login", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
      CIA_USERS: "",
    };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  async function appLogin() {
    const { buildServer } = await import("../src/server.js");
    return buildServer();
  }

  it("login ok retorna token e email", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    process.env.CIA_USERS = `ops@cia.com.br:${hash}`;

    const app = await appLogin();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@cia.com.br", senha: "senha-forte" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { token: string; email: string };
    expect(body.email).toBe("ops@cia.com.br");
    expect(body.token.split(".")).toHaveLength(3);
    await app.close();
  });

  it("credenciais erradas → 401 com mensagem clara", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    process.env.CIA_USERS = `ops@cia.com.br:${hash}`;

    const app = await appLogin();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@cia.com.br", senha: "errada" },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).erro).toMatch(/incorretos/i);
    await app.close();
  });
});

describe("registrarAuth middleware — JWT + x-api-key", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
    };
    delete process.env.AUTH_DEMO_FALLBACK;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = envBackup;
    vi.resetModules();
  });

  it("rotas públicas incluem /api/auth/login", async () => {
    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.post("/api/auth/login", async () => ({ ok: true }));
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
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

  it("x-api-key válida libera rota protegida (sem AUTH_MODE)", async () => {
    process.env.CIA_API_KEY = "segredo-interno";

    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/cotacoes", async (req) => ({
      userId: req.auth?.userId,
      tenant: req.auth?.tenantSlug,
    }));

    const res = await app.inject({
      method: "GET",
      url: "/api/cotacoes",
      headers: { "x-api-key": "segredo-interno" },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ userId: "apikey", tenant: "default" });
    await app.close();
  });

  it("JWT válido libera rota protegida", async () => {
    const token = await emitirToken("user@cia.com.br");

    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/cotacoes", async (req) => ({ userId: req.auth?.userId }));

    const res = await app.inject({
      method: "GET",
      url: "/api/cotacoes",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).userId).toBe("user@cia.com.br");
    await app.close();
  });

  it("JWT expirado → 401", async () => {
    const token = await emitirTokenExpirado("user@cia.com.br");

    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.get("/api/cotacoes", async () => ({ ok: true }));

    const res = await app.inject({
      method: "GET",
      url: "/api/cotacoes",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("dev x-demo-auth:1 passa com tenant default", async () => {
    delete process.env.CIA_JWT_SECRET;

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
