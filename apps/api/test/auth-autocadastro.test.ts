import Fastify from "fastify";
import bcrypt from "bcryptjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emitirToken, emitirTokenExpirado } from "../src/auth/jwt.js";

type UsuarioRow = {
  id: string;
  email: string;
  senhaHash: string;
  nome: string;
  status: "pendente" | "aprovado" | "bloqueado";
  role: "admin" | "operador";
  criadoEm: Date;
  aprovadoEm: Date | null;
  aprovadoPor: string | null;
  ultimoLoginEm: Date | null;
};

type LoginEventoRow = {
  id: string;
  usuarioId: string | null;
  email: string;
  sucesso: boolean;
  motivo: "ok" | "bloqueado" | "pendente" | "senha_errada";
  criadoEm: Date;
};

const usuarios = new Map<string, UsuarioRow>();
const loginEventos: LoginEventoRow[] = [];

function resetUsuarios() {
  usuarios.clear();
  loginEventos.length = 0;
}

function seedUsuario(partial: Partial<UsuarioRow> & Pick<UsuarioRow, "email" | "senhaHash">) {
  const email = partial.email.trim().toLowerCase();
  const row: UsuarioRow = {
    id: partial.id ?? `u-${email}`,
    email,
    senhaHash: partial.senhaHash,
    nome: partial.nome ?? email.split("@")[0] ?? email,
    status: partial.status ?? "aprovado",
    role: partial.role ?? "operador",
    criadoEm: partial.criadoEm ?? new Date(),
    aprovadoEm: partial.aprovadoEm ?? null,
    aprovadoPor: partial.aprovadoPor ?? null,
    ultimoLoginEm: partial.ultimoLoginEm ?? null,
  };
  usuarios.set(email, row);
  return row;
}

function seedLoginEvento(partial: Partial<LoginEventoRow> & Pick<LoginEventoRow, "email" | "motivo">) {
  const row: LoginEventoRow = {
    id: partial.id ?? `le-${loginEventos.length + 1}`,
    usuarioId: partial.usuarioId ?? null,
    email: partial.email.trim().toLowerCase(),
    sucesso: partial.sucesso ?? partial.motivo === "ok",
    motivo: partial.motivo,
    criadoEm: partial.criadoEm ?? new Date(),
  };
  loginEventos.push(row);
  return row;
}

vi.mock("../src/auth/tenant.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/auth/tenant.js")>();
  return {
    ...actual,
    ensureTenant: vi.fn(async (slug: string) => `tid-${slug}`),
  };
});

vi.mock("@cia/db", () => ({
  prisma: {
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    tenant: {
      upsert: vi.fn(async () => ({ id: "tid-default", slug: "default", nome: "default" })),
    },
    usuario: {
      findUnique: vi.fn(async ({ where }: { where: { email: string } }) => {
        return usuarios.get(where.email.trim().toLowerCase()) ?? null;
      }),
      findMany: vi.fn(async () => [...usuarios.values()]),
      count: vi.fn(async ({ where }: { where?: { status?: string } }) => {
        if (!where?.status) return usuarios.size;
        return [...usuarios.values()].filter((u) => u.status === where.status).length;
      }),
      create: vi.fn(async ({ data }: { data: Omit<UsuarioRow, "id" | "criadoEm"> }) => {
        const email = data.email.trim().toLowerCase();
        if (usuarios.has(email)) throw new Error("unique");
        const row: UsuarioRow = {
          id: `u-${email}`,
          criadoEm: new Date(),
          ...data,
          email,
        };
        usuarios.set(email, row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UsuarioRow> }) => {
        const row = [...usuarios.values()].find((u) => u.id === where.id);
        if (!row) throw new Error("not found");
        const atualizado = { ...row, ...data };
        usuarios.set(row.email, atualizado);
        return atualizado;
      }),
    },
    loginEvento: {
      create: vi.fn(async ({ data }: { data: Omit<LoginEventoRow, "id" | "criadoEm"> & { criadoEm?: Date } }) => {
        const row = seedLoginEvento({
          id: `le-${loginEventos.length + 1}`,
          usuarioId: data.usuarioId,
          email: data.email,
          sucesso: data.sucesso,
          motivo: data.motivo,
          criadoEm: data.criadoEm ?? new Date(),
        });
        return row;
      }),
      findMany: vi.fn(async ({ take, skip }: { take?: number; skip?: number }) => {
        return [...loginEventos]
          .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime())
          .slice(skip ?? 0, (skip ?? 0) + (take ?? loginEventos.length));
      }),
      count: vi.fn(async ({ where }: { where?: { motivo?: string; criadoEm?: { gte?: Date } } } = {}) => {
        return loginEventos.filter((ev) => {
          if (where?.motivo && ev.motivo !== where.motivo) return false;
          if (where?.criadoEm?.gte && ev.criadoEm < where.criadoEm.gte) return false;
          return true;
        }).length;
      }),
    },
  },
}));

describe("autocadastro com aprovação admin", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    resetUsuarios();
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
    };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  async function app() {
    const { buildServer } = await import("../src/server.js");
    return buildServer();
  }

  it("cadastro → pendente → login 403", async () => {
    const server = await app();

    const reg = await server.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { nome: "Paulo", email: "paulo@test.com", senha: "senha-forte" },
    });
    expect(reg.statusCode).toBe(201);

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "paulo@test.com", senha: "senha-forte" },
    });
    expect(login.statusCode).toBe(403);
    expect(JSON.parse(login.body).erro).toMatch(/aprovação/i);
    await server.close();
  });

  it("aprovação → login 200", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    const pendente = seedUsuario({
      email: "ops@test.com",
      senhaHash: hash,
      nome: "Ops",
      status: "pendente",
    });
    seedUsuario({
      email: "admin@test.com",
      senhaHash: await bcrypt.hash("admin-pass", 12),
      nome: "Admin",
      status: "aprovado",
      role: "admin",
    });

    const server = await app();
    const adminToken = await emitirToken({ email: "admin@test.com", role: "admin", nome: "Admin" });

    const aprovar = await server.inject({
      method: "PATCH",
      url: `/api/admin/usuarios/${pendente.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { acao: "aprovar" },
    });
    expect(aprovar.statusCode).toBe(200);

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@test.com", senha: "senha-forte" },
    });
    expect(login.statusCode).toBe(200);
    expect(JSON.parse(login.body).email).toBe("ops@test.com");
    await server.close();
  });

  it("bloqueio → login 403", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    const bloqueado = seedUsuario({
      email: "bloq@test.com",
      senhaHash: hash,
      status: "bloqueado",
    });
    seedUsuario({
      email: "admin@test.com",
      senhaHash: await bcrypt.hash("admin-pass", 12),
      status: "aprovado",
      role: "admin",
    });

    const server = await app();
    const adminToken = await emitirToken({ email: "admin@test.com", role: "admin" });

    const patch = await server.inject({
      method: "PATCH",
      url: `/api/admin/usuarios/${bloqueado.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { acao: "bloquear" },
    });
    expect(patch.statusCode).toBe(200);

    const login = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "bloq@test.com", senha: "senha-forte" },
    });
    expect(login.statusCode).toBe(403);
    expect(JSON.parse(login.body).erro).toMatch(/bloquead/i);
    expect(loginEventos).toHaveLength(1);
    expect(loginEventos[0]).toMatchObject({
      usuarioId: bloqueado.id,
      email: "bloq@test.com",
      sucesso: false,
      motivo: "bloqueado",
    });
    await server.close();
  });

  it("rotas admin — operador recebe 403", async () => {
    seedUsuario({
      email: "ops@test.com",
      senhaHash: await bcrypt.hash("x", 12),
      status: "aprovado",
      role: "operador",
    });

    const server = await app();
    const token = await emitirToken({ email: "ops@test.com", role: "operador" });
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usuarios",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
    const eventos = await server.inject({
      method: "GET",
      url: "/api/admin/login-eventos",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(eventos.statusCode).toBe(403);
    await server.close();
  });

  it("badge pendentes — contagem correta", async () => {
    seedUsuario({
      email: "p1@test.com",
      senhaHash: "x",
      status: "pendente",
    });
    seedUsuario({
      email: "p2@test.com",
      senhaHash: "x",
      status: "pendente",
    });
    seedUsuario({
      email: "admin@test.com",
      senhaHash: "x",
      status: "aprovado",
      role: "admin",
    });

    const server = await app();
    const token = await emitirToken({ email: "admin@test.com", role: "admin" });
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/usuarios/pendentes-count",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).pendentes).toBe(2);
    await server.close();
  });

  it("badge bloqueados — conta só tentativas bloqueadas nas últimas 24h", async () => {
    seedUsuario({
      email: "admin@test.com",
      senhaHash: "x",
      status: "aprovado",
      role: "admin",
    });
    seedLoginEvento({ email: "bloq1@test.com", motivo: "bloqueado" });
    seedLoginEvento({ email: "bloq2@test.com", motivo: "bloqueado", criadoEm: new Date(Date.now() - 25 * 60 * 60 * 1000) });
    seedLoginEvento({ email: "ops@test.com", motivo: "senha_errada" });

    const server = await app();
    const token = await emitirToken({ email: "admin@test.com", role: "admin" });
    const res = await server.inject({
      method: "GET",
      url: "/api/admin/login-eventos/bloqueados-count",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).bloqueados24h).toBe(1);
    await server.close();
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

  it("rotas públicas incluem /api/auth/login e /api/auth/register", async () => {
    const { registrarAuth } = await import("../src/auth/middleware.js");
    const app = Fastify();
    await registrarAuth(app);
    app.post("/api/auth/login", async () => ({ ok: true }));
    app.post("/api/auth/register", async () => ({ ok: true }));
    const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: {} });
    const reg = await app.inject({ method: "POST", url: "/api/auth/register", payload: {} });
    expect(login.statusCode).toBe(200);
    expect(reg.statusCode).toBe(200);
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
    const token = await emitirToken({ email: "user@cia.com.br" });

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

describe("POST /api/auth/login", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    resetUsuarios();
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://test:test@127.0.0.1:5432/test",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
    };
  });

  afterEach(() => {
    process.env = envBackup;
  });

  async function appLogin() {
    const { buildServer } = await import("../src/server.js");
    return buildServer();
  }

  it("login ok retorna token, email, nome e role", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    seedUsuario({ email: "ops@cia.com.br", senhaHash: hash, nome: "Operador", role: "operador" });

    const app = await appLogin();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@cia.com.br", senha: "senha-forte" },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { token: string; email: string; nome: string; role: string };
    expect(body.email).toBe("ops@cia.com.br");
    expect(body.nome).toBe("Operador");
    expect(body.role).toBe("operador");
    expect(body.token.split(".")).toHaveLength(3);
    const usuario = usuarios.get("ops@cia.com.br");
    expect(usuario?.ultimoLoginEm).toBeInstanceOf(Date);
    expect(loginEventos).toHaveLength(1);
    expect(loginEventos[0]).toMatchObject({
      usuarioId: usuario?.id,
      email: "ops@cia.com.br",
      sucesso: true,
      motivo: "ok",
    });
    await app.close();
  });

  it("credenciais erradas → 401 com mensagem clara", async () => {
    const hash = await bcrypt.hash("senha-forte", 12);
    seedUsuario({ email: "ops@cia.com.br", senhaHash: hash });

    const app = await appLogin();
    const res = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "ops@cia.com.br", senha: "errada" },
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).erro).toMatch(/incorretos/i);
    expect(loginEventos).toHaveLength(1);
    expect(loginEventos[0]).toMatchObject({
      email: "ops@cia.com.br",
      sucesso: false,
      motivo: "senha_errada",
    });
    await app.close();
  });
});
