import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  associarFotosLinhas,
  associarFotosLinhasComSink,
  extrairFotosXlsx,
  parseOcrTexto,
  parsePlanilhaBuffer,
  type FotoSink,
  type ResultadoParse,
} from "@cia/pipeline";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "../../..");
const SNAPSHOT = JSON.parse(
  readFileSync(join(__dir, "fixtures/parse-base-b9d5aec.snapshot.json"), "utf8"),
) as Record<string, unknown>;

function fotoCanonica(bytes: Buffer, mime?: string) {
  return {
    mime: mime ?? "image/jpeg",
    tamanho: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function canonico(parsed: ResultadoParse, refs = new Map<string, Buffer>()) {
  return {
    aba: parsed.aba,
    abasCandidatas: parsed.abasCandidatas,
    headerRow: parsed.headerRow,
    colunas: parsed.colunas,
    linhas: parsed.linhas.map(({ fotoBase64, fotoRef, fotoMime, ...linha }) => {
      const bytes = fotoBase64
        ? Buffer.from(fotoBase64, "base64")
        : fotoRef
          ? refs.get(fotoRef)
          : undefined;
      if (fotoRef && !bytes) throw new Error(`fotoRef sem bytes no sink: ${fotoRef}`);
      return {
        ...linha,
        ...(bytes ? { foto: fotoCanonica(bytes, fotoMime) } : {}),
      };
    }),
    avisos: parsed.avisos,
    imagensArquivo: parsed.imagensArquivo,
    imagensMapeadas: parsed.imagensMapeadas,
    moedaPlanilha: parsed.moedaPlanilha,
    sammelkarton: parsed.sammelkarton,
    colunaNcmDetectada: parsed.colunaNcmDetectada,
    linhasComNcmColuna: parsed.linhasComNcmColuna,
    linhasTotaisDescartadas: parsed.linhasTotaisDescartadas,
  };
}

function sinkMemoria() {
  const refs = new Map<string, Buffer>();
  let index = 0;
  const fotoSink: FotoSink = async ({ buffer }) => {
    const ref = String(++index).padStart(32, "0");
    refs.set(ref, Buffer.from(buffer));
    return ref;
  };
  return { refs, fotoSink };
}

async function xlsxDrawingParcial(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types></Types>");
  zip.file("xl/media/image1.jpeg", Buffer.from("imagem-1"));
  zip.file("xl/media/image2.jpeg", Buffer.from("imagem-2"));
  zip.file("xl/media/image3.jpeg", Buffer.from("imagem-3"));
  zip.file(
    "xl/drawings/drawing1.xml",
    "<xdr:wsDr><xdr:twoCellAnchor><xdr:from><xdr:col>8</xdr:col><xdr:row>9</xdr:row></xdr:from></xdr:twoCellAnchor></xdr:wsDr>",
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("fotoRef — equivalência canônica com b9d5aec", () => {
  const fixtures = [
    ["ncm1.xlsx", join(ROOT, "tools/fixtures/ncm1.xlsx")],
    ["d003.xlsx", join(ROOT, "tools/fixtures/d003.xlsx")],
    ["packing-89-total-row.xlsx", join(ROOT, "tools/fixtures/packing-89-total-row.xlsx")],
    ["fatura-92-real.xls", join(ROOT, "tools/fixtures/fatura-92-real.xls")],
    [
      "packliste-DE-2026-0815.xlsx",
      join(ROOT, "packages/pipeline/test/fixtures/packliste-DE-2026-0815.xlsx"),
    ],
  ] as const;

  for (const [nome, path] of fixtures) {
    it(`${nome}: legado e fotoSink preservam linhas, colunas, fotos e avisos`, async () => {
      const bytes = readFileSync(path);
      const legado = await parsePlanilhaBuffer(bytes);
      expect(canonico(legado)).toEqual(SNAPSHOT[nome]);

      const sink = sinkMemoria();
      const porRef = await parsePlanilhaBuffer(bytes, { fotoSink: sink.fotoSink });
      expect(porRef.linhas.some((linha) => linha.fotoBase64)).toBe(false);
      expect(canonico(porRef, sink.refs)).toEqual(SNAPSHOT[nome]);
    }, 120_000);
  }

  it("packing-list-wyc-real.pdf preserva parse OCR canônico", () => {
    const texto = readFileSync(join(ROOT, "tools/fixtures/packing-list-wyc-ocr.txt"), "utf8");
    const parsed = parseOcrTexto(texto, "packing-list-wyc-real.pdf");
    expect(canonico(parsed)).toEqual(SNAPSHOT["packing-list-wyc-real.pdf"]);
  });

  it("drawing parcial preserva fallback por ordem nos dois modos", async () => {
    const out = await extrairFotosXlsx(await xlsxDrawingParcial());
    const linhas = [{ linha: 10 }, { linha: 11 }, { linha: 12 }];
    const legado = associarFotosLinhas(linhas, out.fotos);
    const legadoCanonico = {
      mediaCount: out.mediaCount,
      linhas: legado.map(({ fotoBase64, fotoMime, ...linha }) => ({
        ...linha,
        ...(fotoBase64 ? { foto: fotoCanonica(Buffer.from(fotoBase64, "base64"), fotoMime) } : {}),
      })),
    };
    expect(legadoCanonico).toEqual(SNAPSHOT["drawing-parcial-sintetico"]);

    const sink = sinkMemoria();
    const porRef = await associarFotosLinhasComSink(linhas, out.fotos, sink.fotoSink);
    const refCanonico = {
      mediaCount: out.mediaCount,
      linhas: porRef.map(({ fotoRef, fotoMime, ...linha }) => ({
        ...linha,
        ...(fotoRef ? { foto: fotoCanonica(sink.refs.get(fotoRef)!, fotoMime) } : {}),
      })),
    };
    expect(refCanonico).toEqual(SNAPSHOT["drawing-parcial-sintetico"]);
  });
});
