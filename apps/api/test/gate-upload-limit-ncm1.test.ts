/**
 * Gate upload — planilhas grandes com fotos (ncm1.xlsx ~26MB) passam pelo /api/parse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { UPLOAD_MAX_BYTES } from "../src/upload-limits.js";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    tenant: {
      upsert: vi.fn(async ({ where }: { where: { slug: string } }) => ({
        id: `tid-${where.slug}`,
        slug: where.slug,
        nome: where.slug,
      })),
    },
  },
}));

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const FIXTURE_NCM1 = join(ROOT, "tools/fixtures/ncm1.xlsx");
const RESPOSTA_BASE_NCM1_SHA256 = "6b6052658c103f7e6595907ddb748f819f0b019c1e633fd3601a8ff014dfc8d9";

function multipartBody(filename: string, buf: Buffer, boundary = "----cia-upload-test"): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, buf, tail]);
}

describe("gate upload limite 60MB — ncm1 com fotos", () => {
  const envBackup = { ...process.env };
  let parseFotosDir: string;
  let featuresPath: string;

  beforeEach(async () => {
    parseFotosDir = await mkdtemp(join(os.tmpdir(), "cia-upload-fotos-"));
    featuresPath = join(parseFotosDir, "features.json");
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
      CIA_API_KEY: "gate-upload-test-key",
      PARSE_FOTOS_DIR: parseFotosDir,
      CIA_FEATURES_PATH: featuresPath,
    };
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = envBackup;
    await rm(parseFotosDir, { recursive: true, force: true });
    vi.resetModules();
  });

  it("limite cobre o fixture real ncm1.xlsx (~26MB)", () => {
    const size = statSync(FIXTURE_NCM1).size;
    expect(size).toBeGreaterThan(20 * 1024 * 1024);
    expect(size).toBeLessThan(UPLOAD_MAX_BYTES);
  });

  async function parseNcm1(app: FastifyInstance) {
    const buf = readFileSync(FIXTURE_NCM1);
    const res = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-api-key": "gate-upload-test-key",
        "content-type": "multipart/form-data; boundary=----cia-upload-test",
      },
      payload: multipartBody("ncm1.xlsx", buf),
    });
    return res;
  }

  it("modos ligado/desligado preservam parse e bytes das fotos; desligado mantém snapshot da base", async () => {
    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: ["default"] }));
    const { buildServer } = await import("../src/server.js");
    const { resetFeatureFlagsCacheParaTestes } = await import("../src/services/feature-flags.js");
    const app = await buildServer();
    const res = await parseNcm1(app);

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      totalLinhas?: number;
      erro?: string;
      linhas?: Array<{ fotoRef?: string; fotoBase64?: string }>;
    };
    expect(body.erro).toBeUndefined();
    expect(body.totalLinhas).toBe(34);
    expect(body.linhas?.every((linha) => /^[a-f0-9]{32}$/.test(linha.fotoRef ?? ""))).toBe(true);
    expect(body.linhas?.some((linha) => linha.fotoBase64)).toBe(false);
    expect(res.body).not.toContain("fotoBase64");

    const hashesRefs: string[] = [];
    for (const linha of body.linhas ?? []) {
      const foto = await app.inject({
        method: "GET",
        url: `/api/parse/fotos/${linha.fotoRef}`,
        headers: { "x-api-key": "gate-upload-test-key" },
      });
      expect(foto.statusCode).toBe(200);
      hashesRefs.push(createHash("sha256").update(foto.rawPayload).digest("hex"));
    }

    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: [] }));
    resetFeatureFlagsCacheParaTestes();
    const legado = await parseNcm1(app);
    expect(legado.statusCode).toBe(200);
    expect(createHash("sha256").update(legado.rawPayload).digest("hex")).toBe(RESPOSTA_BASE_NCM1_SHA256);
    const bodyLegado = legado.json() as {
      totalLinhas?: number;
      linhas?: Array<{ fotoRef?: string; fotoBase64?: string }>;
    };
    expect(bodyLegado.totalLinhas).toBe(34);
    expect(bodyLegado.linhas?.every((linha) => Boolean(linha.fotoBase64))).toBe(true);
    expect(bodyLegado.linhas?.some((linha) => linha.fotoRef)).toBe(false);
    expect(legado.body).not.toContain("fotoRef");
    const hashesLegado = (bodyLegado.linhas ?? []).map((linha) =>
      createHash("sha256").update(Buffer.from(linha.fotoBase64!, "base64")).digest("hex"),
    );
    expect(hashesRefs).toEqual(hashesLegado);
    await app.close();
  }, 180000);

  it("tenant desligado continua recusando arquivo acima de 60 MiB com mensagem legada", async () => {
    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: [] }));
    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const arquivo = Buffer.alloc(UPLOAD_MAX_BYTES + 1);
    const res = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-api-key": "gate-upload-test-key",
        "content-type": "multipart/form-data; boundary=----cia-upload-test",
      },
      payload: multipartBody("acima.xlsx", arquivo),
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toEqual({
      erro: "Arquivo excede 60MB — reduza fotos ou compacte a planilha.",
    });
    await app.close();
  }, 60_000);
});
