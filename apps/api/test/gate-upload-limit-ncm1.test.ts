/**
 * Gate upload — planilhas grandes com fotos (ncm1.xlsx ~26MB) passam pelo /api/parse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { UPLOAD_MAX_BYTES } from "../src/upload-limits.js";

vi.mock("@cia/db", () => ({
  prisma: {
    classificacaoCache: {
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockResolvedValue({}),
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

  beforeEach(() => {
    process.env = { ...envBackup, NODE_ENV: "development", CLERK_SECRET_KEY: "" };
    delete process.env.AUTH_MODE;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = envBackup;
    vi.resetModules();
  });

  it("limite cobre o fixture real ncm1.xlsx (~26MB)", () => {
    const size = statSync(FIXTURE_NCM1).size;
    expect(size).toBeGreaterThan(20 * 1024 * 1024);
    expect(size).toBeLessThan(UPLOAD_MAX_BYTES);
  });

  it("POST /api/parse aceita ncm1.xlsx inteiro sem 422 de tamanho", async () => {
    const buf = readFileSync(FIXTURE_NCM1);
    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-demo-auth": "1",
        "content-type": "multipart/form-data; boundary=----cia-upload-test",
      },
      payload: multipartBody("ncm1.xlsx", buf),
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as { totalLinhas?: number; erro?: string };
    expect(body.erro).toBeUndefined();
    expect(body.totalLinhas).toBe(34);
  }, 120000);
});
