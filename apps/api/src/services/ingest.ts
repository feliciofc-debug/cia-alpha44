/** Ingestão unificada: Excel, CSV, PDF e imagem → linhas para cotação. */

import { createHash } from "node:crypto";
import {
  aplicarPrecoCustoLinha,
  detectarPrecoCusto,
  precoCustoUnitarioUSD,
  parseSupplierFile,
  parseSupplierOcrText,
  rotuloPrecoCusto,
  type ParsedSupplierFile,
} from "@cia/pipeline";
import type { OcrProvider } from "../ocr/types.js";
import type { LlmProvider } from "../llm/types.js";
import { resolverMapearColunasPlanilha } from "../llm/resolver-mapear-colunas.js";
import { converterLinhasEurParaUsd } from "./conversao-moeda-ingest.js";
import { extrairTextoPdf } from "./pdf-text.js";

const EXT_PLANILHA = /\.(xlsx|xls|csv)$/i;
const EXT_OCR = /\.(pdf|png|jpe?g|webp|tiff?|bmp)$/i;

export type FonteIngestao = "planilha" | "ocr";

export interface IngestResult extends ParsedSupplierFile {
  arquivo: string;
  fonte: FonteIngestao;
  ocrPaginas?: number;
}

export function tipoIngestao(filename: string): FonteIngestao | null {
  const f = filename.toLowerCase();
  if (EXT_PLANILHA.test(f)) return "planilha";
  if (EXT_OCR.test(f)) return "ocr";
  return null;
}

function aplicarPrecosCusto(parsed: ParsedSupplierFile): ParsedSupplierFile {
  const avisos = [...parsed.avisos];
  const linhas = parsed.linhas.map((l) => {
    const tipoAntes = detectarPrecoCusto({
      descOriginal: l.descOriginal,
      ncm: l.ncm,
      uso: l.uso,
      pesoLiqKg: l.pesoLiqKg,
      pesoBrutoKg: l.pesoBrutoKg,
      qtd: l.qtd,
    });
    if (!tipoAntes) return l;
    const next = aplicarPrecoCustoLinha(l);
    const unit = precoCustoUnitarioUSD(tipoAntes);
    const qtd = next.qtd ?? 1;
    avisos.push(
      `Preço custo ${rotuloPrecoCusto(tipoAntes)}: US$ ${unit.toFixed(2)}/un × ${qtd} = US$ ${(next.fobTotalUS ?? 0).toFixed(2)} — ${l.descOriginal.slice(0, 60)}`,
    );
    return next;
  });
  return { ...parsed, linhas, avisos };
}

function logDeteccaoNcmUpload(filename: string, bytes: Uint8Array, parsed: ParsedSupplierFile): void {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const colunasNcm = parsed.colunas
    .filter((c) => c.campo === "ncm")
    .map((c) => ({ colIndex: c.colIndex, header: c.header, confianca: c.confianca }));
  const metaNcm = parsed.metaNcmEmbarque;

  console.info(
    "[upload:ncm-detection]",
    JSON.stringify({
      arquivo: filename,
      sha256,
      abaUsada: parsed.abaUsada,
      abasCandidatas: parsed.abasCandidatas,
      headerRowIndex: parsed.headerRowIndex,
      colunaNcmDetectada: metaNcm?.colunaDetectada ?? colunasNcm.length > 0,
      colunasNcm,
      linhasComNcmColuna: metaNcm?.linhasComNcmColuna ?? parsed.linhas.filter((l) => l.ncm != null).length,
      totalLinhas: metaNcm?.totalLinhas ?? parsed.totalLinhas,
      linhaTotaisDescartada: parsed.linhasTotaisDescartadas ?? 0,
      imagensArquivo: parsed.imagensArquivo,
      imagensMapeadas: parsed.imagensMapeadas,
    }),
  );
}

export async function ingerirArquivo(
  filename: string,
  bytes: Uint8Array,
  ocr: OcrProvider,
  llm?: LlmProvider,
): Promise<IngestResult> {
  const fonte = tipoIngestao(filename);
  if (!fonte) {
    throw new Error("Formato não suportado. Use .xlsx, .csv, .pdf ou imagem (.png, .jpg).");
  }

  if (fonte === "planilha") {
    const mapearColunasIA = llm ? resolverMapearColunasPlanilha(llm) : undefined;
    const parsed = aplicarPrecosCusto(await parseSupplierFile(bytes, { mapearColunasIA }));
    logDeteccaoNcmUpload(filename, bytes, parsed);
    const convertido = await converterLinhasEurParaUsd(parsed);
    return { ...convertido, arquivo: filename, fonte };
  }

  const avisosIngest: string[] = [];

  if (filename.toLowerCase().endsWith(".pdf")) {
    const nativo = await extrairTextoPdf(bytes);
    if (nativo && nativo.length > 60) {
      const parsedNativo = parseSupplierOcrText(nativo, filename);
      if (parsedNativo.totalLinhas > 0) {
        const parsedNativoCusto = aplicarPrecosCusto(parsedNativo);
        const convertido = await converterLinhasEurParaUsd(parsedNativoCusto);
        return {
          ...convertido,
          arquivo: filename,
          fonte,
          avisos: ["Texto extraído do PDF (sem OCR externo).", ...convertido.avisos],
        };
      }
      avisosIngest.push("PDF com texto nativo, mas parser não encontrou itens — tentando OCR.");
    }
  }

  if (!ocr.disponivel) {
    throw new Error("OCR não configurado — defina OCR_API_KEY na VPS (ver docs/OCR.md).");
  }

  const ocrOut = await ocr.extrair(bytes, filename);
  const parsed = aplicarPrecosCusto(parseSupplierOcrText(ocrOut.texto, filename));
  const convertido = await converterLinhasEurParaUsd(parsed);
  return {
    ...convertido,
    arquivo: filename,
    fonte,
    ocrPaginas: ocrOut.paginas,
    avisos: [...avisosIngest, ...ocrOut.avisos, ...convertido.avisos],
  };
}
