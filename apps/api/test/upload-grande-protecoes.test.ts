import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { mkdtemp, mkdir, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

function multipartBody(filename: string, buf: Buffer, boundary = "----cia-grande-test"): Buffer {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, buf, tail]);
}

function zipComTamanhoDeclarado(tamanho: number, nome = "xl/media/bomba.png"): Buffer {
  const nomeBuf = Buffer.from(nome);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  const central = Buffer.alloc(46 + nomeBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt32LE(tamanho, 24);
  central.writeUInt16LE(nomeBuf.length, 28);
  nomeBuf.copy(central, 46);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, eocd]);
}

describe("upload grande — limites, fila, ZIP, cotas e limpeza", { timeout: 60_000 }, () => {
  const envBackup = { ...process.env };
  let root: string;
  let fotosDir: string;
  let uploadsDir: string;
  let featuresPath: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "cia-upload-grande-"));
    fotosDir = path.join(root, "parse-fotos");
    uploadsDir = path.join(root, "parse-uploads");
    featuresPath = path.join(root, "features.json");
    await writeFile(featuresPath, JSON.stringify({ upgradeUpload: ["default"] }));
    process.env = {
      ...envBackup,
      NODE_ENV: "development",
      CIA_JWT_SECRET: "test-jwt-secret-minimo-32-chars!!",
      CIA_API_KEY: "upload-grande-key",
      CIA_API_TENANT_SLUG: "default",
      CIA_FEATURES_PATH: featuresPath,
      PARSE_FOTOS_DIR: fotosDir,
      PARSE_UPLOAD_TMP_DIR: uploadsDir,
      UPLOAD_GRANDE_MAX_MB: "1",
      UPLOAD_GRANDE_MULTIPART_MARGIN_MB: "1",
      PARSE_ZIP_MAX_UNCOMPRESSED_MB: "1",
      PARSE_ZIP_MAX_ENTRIES: "20",
      PARSE_ZIP_MAX_IMAGE_MB: "1",
      PARSE_COTA_TENANT_MB: "8",
      PARSE_COTA_GLOBAL_MB: "16",
    };
    vi.resetModules();
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    vi.resetModules();
    await rm(root, { recursive: true, force: true });
  });

  it("aceita dentro do limite e recusa Content-Length e stream acima dele", async () => {
    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const headers = {
      "x-api-key": "upload-grande-key",
      "content-type": "multipart/form-data; boundary=----cia-grande-test",
    };

    const csv = Buffer.from("descricao,qtd,peso bruto,peso liquido,preco unitario\nProduto teste,2,4,3,10\n");
    const ok = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers,
      payload: multipartBody("teste.csv", csv),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().totalLinhas).toBe(1);
    expect(
      (await readdir(uploadsDir, { recursive: true }).catch(() => []))
        .filter((nome) => String(nome).endsWith(".upload")),
    ).toEqual([]);

    const antecipado = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: { ...headers, "content-length": String(3 * 1024 * 1024) },
      payload: multipartBody("teste.csv", csv),
    });
    expect(antecipado.statusCode).toBe(422);
    expect(antecipado.json()).toEqual({
      erro: "Arquivo excede 1MB — reduza fotos ou compacte a planilha.",
    });
    expect(
      (await readdir(uploadsDir, { recursive: true }).catch(() => []))
        .filter((nome) => String(nome).endsWith(".upload")),
    ).toEqual([]);

    const acima = Buffer.alloc(1024 * 1024 + 1, 0x61);
    const streaming = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers,
      payload: multipartBody("grande.csv", acima),
    });
    expect(streaming.statusCode).toBe(422);
    expect(streaming.json()).toEqual({
      erro: "Arquivo excede 1MB — reduza fotos ou compacte a planilha.",
    });

    const arquivos = await readdir(uploadsDir, { recursive: true }).catch(() => []);
    expect(arquivos.filter((nome) => String(nome).endsWith(".upload"))).toEqual([]);
    await app.close();
  });

  it("limita a uma execução e duas esperas; a quarta requisição recebe 503", async () => {
    const upload = await import("../src/services/parse-upload-grande.js");
    const ativa = await upload.adquirirVagaParseGrande();
    expect(ativa).toBeTypeOf("function");
    const esperaUm = upload.adquirirVagaParseGrande();
    const esperaDois = upload.adquirirVagaParseGrande();

    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const body = multipartBody("teste.csv", Buffer.from("descricao,qtd\nProduto,1\n"));
    const res = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-api-key": "upload-grande-key",
        "content-type": "multipart/form-data; boundary=----cia-grande-test",
      },
      payload: body,
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().erro).toMatch(/Processamento de uploads ocupado/);

    ativa!();
    (await esperaUm)!();
    (await esperaDois)!();
    await app.close();
  });

  it("recusa ZIP bomb e cota de disco sem deixar temporários", async () => {
    const upload = await import("../src/services/parse-upload-grande.js");
    const zip = zipComTamanhoDeclarado(2 * 1024 * 1024);
    expect(() => upload.validarZipAntesDoParse(zip)).toThrow(/excede 1MB descomprimidos/);

    const { buildServer } = await import("../src/server.js");
    const app = await buildServer();
    const respostaZip = await app.inject({
      method: "POST",
      url: "/api/parse",
      headers: {
        "x-api-key": "upload-grande-key",
        "content-type": "multipart/form-data; boundary=----cia-grande-test",
      },
      payload: multipartBody("bomba.xlsx", zip),
    });
    expect(respostaZip.statusCode).toBe(422);
    expect(respostaZip.json().erro).toMatch(/excede 1MB descomprimidos/);
    await app.close();

    process.env.PARSE_COTA_TENANT_MB = "0.001";
    const tenantId = "tid-default";
    const origem = Readable.from([Buffer.alloc(2048)]);
    await expect(upload.salvarUploadTemporario(tenantId, origem)).rejects.toThrow(
      /Espaço temporário deste tenant esgotado/,
    );
    const arquivos = await readdir(uploadsDir, { recursive: true }).catch(() => []);
    expect(arquivos.filter((nome) => String(nome).endsWith(".upload"))).toEqual([]);
  });

  it("remove temporário em abort e varre sobras antigas no start", async () => {
    const upload = await import("../src/services/parse-upload-grande.js");
    const abort = new AbortController();
    abort.abort();
    await expect(
      upload.salvarUploadTemporario("tid-default", Readable.from([Buffer.alloc(128)]), abort.signal),
    ).rejects.toThrow();

    const { parseUploadsTenantDir } = await import("../src/services/parse-storage.js");
    const dir = parseUploadsTenantDir("tid-default");
    await mkdir(dir, { recursive: true });
    const antigo = path.join(dir, `${createHash("md5").update("antigo").digest("hex")}.upload`);
    await writeFile(antigo, "sobra");
    const dataAntiga = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(antigo, dataAntiga, dataAntiga);
    await upload.limparUploadsTemporarios();
    await expect(readdir(dir)).rejects.toThrow();
  });
});
