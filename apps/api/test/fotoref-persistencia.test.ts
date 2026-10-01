import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

describe("fotoRef — compatibilidade da persistência", () => {
  const envBackup = { ...process.env };
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "cia-fotoref-save-"));
    vi.resetModules();
    process.env.FOTOS_DIR = path.join(root, "fotos");
    process.env.PARSE_FOTOS_DIR = path.join(root, "parse-fotos");
  });

  afterEach(async () => {
    process.env = { ...envBackup };
    vi.resetModules();
    await rm(root, { recursive: true, force: true });
  });

  it("fotoRef reidrata e grava no FOTOS_DIR com o mesmo SHA-256 do base64 legado", async () => {
    const bytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw4AAAAASUVORK5CYII=",
      "base64",
    );
    const [{ salvarFotoParse }, { hidratarFotosRef }, fotos, { prepararFotoParaPdf }] = await Promise.all([
      import("../src/services/parse-fotos.js"),
      import("../src/services/foto-ref-boundary.js"),
      import("../src/services/fotos.js"),
      import("../src/services/pdf-fotos.js"),
    ]);
    const ref = await salvarFotoParse("tenant-a", bytes, "image/png");
    const porRef = await hidratarFotosRef(
      [{ descOriginal: "produto", fotoRef: ref, fotoMime: "image/png" }],
      "tenant-a",
      true,
    );
    const legado = [{ descOriginal: "produto", fotoBase64: bytes.toString("base64"), fotoMime: "image/png" }];
    expect(porRef[0]!.fotoBase64).toBe(legado[0]!.fotoBase64);

    const relRef = await fotos.salvarFotoItem("cot-ref", 0, porRef[0]!.fotoBase64!, "image/png");
    const relLegado = await fotos.salvarFotoItem("cot-legado", 0, legado[0]!.fotoBase64, "image/png");
    const [salvaRef, salvaLegado] = await Promise.all([
      fotos.lerFotoItem(relRef),
      fotos.lerFotoItem(relLegado),
    ]);
    const sha = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
    expect(sha(salvaRef!.buffer)).toBe(sha(bytes));
    expect(sha(salvaLegado!.buffer)).toBe(sha(bytes));
    const [pdfRef, pdfLegado] = await Promise.all([
      prepararFotoParaPdf(Buffer.from(porRef[0]!.fotoBase64!, "base64")),
      prepararFotoParaPdf(Buffer.from(legado[0]!.fotoBase64, "base64")),
    ]);
    expect(pdfRef).not.toBeNull();
    expect(pdfRef && sha(pdfRef)).toBe(pdfLegado && sha(pdfLegado));
  });
});
