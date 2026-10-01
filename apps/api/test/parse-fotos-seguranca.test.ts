import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("@cia/db", () => ({
  prisma: {
    tenant: {
      upsert: vi.fn(async ({ where }: { where: { slug: string } }) => ({
        id: `tid-${where.slug}`,
        slug: where.slug,
        nome: where.slug,
      })),
    },
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
  },
}));

import {
  lerFotoParse,
  limparFotosParseExpiradas,
  salvarFotoParse,
} from "../src/services/parse-fotos.js";
import { buildServer } from "../src/server.js";

describe("fotos temporárias do parse — isolamento e expiração", () => {
  const envBackup = { ...process.env };
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "cia-parse-fotos-"));
    process.env.PARSE_FOTOS_DIR = dir;
    process.env.PARSE_FOTOS_TTL_HORAS = "168";
    process.env.NODE_ENV = "development";
    process.env.CIA_API_KEY = "parse-fotos-test-key";
    process.env.CIA_API_TENANT_SLUG = "default";
    process.env.CIA_JWT_SECRET = "test-jwt-secret-minimo-32-chars!!";
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    await rm(dir, { recursive: true, force: true });
  });

  it("referência inválida, de outro tenant e expirada devolvem 404 sem caminho", async () => {
    const refOutroTenant = await salvarFotoParse("tid-outro", Buffer.from("segredo"), "image/png");
    const refExpirada = await salvarFotoParse("tid-default", Buffer.from("expirada"), "image/jpeg");
    process.env.PARSE_FOTOS_TTL_HORAS = "0.000001";
    await limparFotosParseExpiradas(Date.now() + 60_000);

    expect(await lerFotoParse("tid-default", "../../etc/passwd")).toBeNull();
    expect(await lerFotoParse("tid-default", refOutroTenant)).toBeNull();
    expect(await lerFotoParse("tid-default", refExpirada)).toBeNull();

    const app = await buildServer();
    for (const ref of ["../../etc/passwd", refOutroTenant, refExpirada]) {
      const encoded = encodeURIComponent(ref);
      const res = await app.inject({
        method: "GET",
        url: `/api/parse/fotos/${encoded}`,
        headers: { "x-api-key": "parse-fotos-test-key" },
      });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain(dir);
    }
    await app.close();
  });

  it("tenant correto recebe os mesmos bytes e mime", async () => {
    const bytes = Buffer.from("foto-segura");
    const ref = await salvarFotoParse("tid-default", bytes, "image/png");
    const foto = await lerFotoParse("tid-default", ref);
    expect(foto?.buffer).toEqual(bytes);
    expect(foto?.mime).toBe("image/png");
  });
});
