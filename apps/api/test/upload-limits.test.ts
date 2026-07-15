import { describe, expect, it } from "vitest";
import {
  ERRO_UPLOAD_EXCEDE_LIMITE,
  mensagemArquivoGrandeDemais,
  UPLOAD_MAX_BYTES,
  UPLOAD_MAX_MB,
} from "../src/upload-limits.js";

describe("upload-limits", () => {
  it("define limite de 60MB para planilhas com fotos", () => {
    expect(UPLOAD_MAX_MB).toBe(60);
    expect(UPLOAD_MAX_BYTES).toBe(60 * 1024 * 1024);
    expect(ERRO_UPLOAD_EXCEDE_LIMITE).toContain("60MB");
    expect(mensagemArquivoGrandeDemais()).toBe(ERRO_UPLOAD_EXCEDE_LIMITE);
  });
});
