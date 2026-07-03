import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { associarFotosLinhas, extrairFotosXlsx } from "../src/xlsx-images.js";

async function xlsxComMidiasEDrawingParcial(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", "<Types></Types>");
  zip.file("xl/media/image1.jpeg", Buffer.from("imagem-1"));
  zip.file("xl/media/image2.jpeg", Buffer.from("imagem-2"));
  zip.file("xl/media/image3.jpeg", Buffer.from("imagem-3"));
  zip.file(
    "xl/drawings/drawing1.xml",
    [
      "<xdr:wsDr>",
      "<xdr:twoCellAnchor>",
      "<xdr:from><xdr:col>8</xdr:col><xdr:row>9</xdr:row></xdr:from>",
      "</xdr:twoCellAnchor>",
      "</xdr:wsDr>",
    ].join(""),
  );
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("xlsx-images — fallback para arquivo re-salvo com drawing parcial", () => {
  it("usa ordem das mídias quando há mais imagens em xl/media do que âncoras", async () => {
    const { fotos, mediaCount } = await extrairFotosXlsx(await xlsxComMidiasEDrawingParcial());

    expect(mediaCount).toBe(3);
    expect([...fotos.keys()]).toEqual([-1, -2, -3]);

    const linhas = [{ linha: 10 }, { linha: 11 }, { linha: 12 }];
    const out = associarFotosLinhas(linhas, fotos);

    expect(out.filter((l) => l.fotoBase64).length).toBe(3);
    expect(out[0]!.fotoBase64).toBe(Buffer.from("imagem-1").toString("base64"));
    expect(out[2]!.fotoBase64).toBe(Buffer.from("imagem-3").toString("base64"));
  });
});
