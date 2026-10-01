/**
 * Gate upload — planilhas grandes com fotos (ncm1.xlsx ~26MB) passam pelo /api/parse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

  async function parseNcm1() {
    const buf = readFileSync(FIXTURE_NCM1);
    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-api-key": "gate-upload-test-key",
        "content-type": "multipart/form-data; boundary=----cia-upload-test",
      },
      payload: multipartBody("ncm1.xlsx", buf),
    });
    await app.close();
    return res;
  }

  it("POST /api/parse com upgrade ligado devolve fotoRef sem base64", async () => {
    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: ["default"] }));
    const res = await parseNcm1();

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
  }, 120000);

  it("POST /api/parse com upgrade desligado preserva base64 e não devolve fotoRef", async () => {
    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: [] }));
    const res = await parseNcm1();
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      totalLinhas?: number;
      linhas?: Array<{ fotoRef?: string; fotoBase64?: string }>;
    };
    expect(body.totalLinhas).toBe(34);
    expect(body.linhas?.every((linha) => Boolean(linha.fotoBase64))).toBe(true);
    expect(body.linhas?.some((linha) => linha.fotoRef)).toBe(false);
    expect(res.body).not.toContain("fotoRef");
  }, 120000);
});
