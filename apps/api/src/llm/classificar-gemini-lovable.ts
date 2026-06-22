/**
 * Classificação NCM via Gemini/Lovable — após planilha cliente e cache; antes do fluxo legado.
 */

import type { NcmCatalog } from "@cia/pipeline";
import { sugerirNcm } from "../services/ncm-helper.js";
import { mapComConcorrencia } from "../util/map-concorrencia.js";
import type { ClassifyItemInput, ClassifyItemOutput } from "./types.js";

const AVISO_PENDENTE = "Classificação pendente — revisar";

export function geminiClassificacaoHabilitada(): boolean {
  const p = (process.env.CLASSIFICACAO_NCM_PROVIDER ?? "gemini").toLowerCase();
  if (p === "off" || p === "legacy" || p === "anthropic" || p === "2passes") return false;
  return p === "gemini" || p === "lovable" || p === "auto";
}

function saidaPendente(input: ClassifyItemInput, aviso?: string): ClassifyItemOutput {
  const descPt = input.descPtConfirmado?.trim() || input.descOriginal.trim();
  return {
    descPt,
    descDuimp: `${descPt} — ${aviso ?? AVISO_PENDENTE}.`,
    ncmCandidatos: [],
    classificacaoBaixaConfianca: true,
    classificacaoProvedor: "gemini",
    avisoTraducao: aviso,
  };
}

function inputParaSugerir(input: ClassifyItemInput): string {
  const partes = [input.descOriginal.trim()];
  if (input.material?.trim()) partes.push(`Material: ${input.material.trim()}`);
  if (input.uso?.trim()) partes.push(`Uso: ${input.uso.trim()}`);
  return partes.join(" · ");
}

/** Classifica lote via Lovable/Gemini (paralelo). Retorna ok=false → caller faz fallback legado. */
export async function classificarItensGeminiLote(
  inputs: ClassifyItemInput[],
  catalog: NcmCatalog,
  concurrency = 6,
): Promise<Array<{ ok: boolean; output: ClassifyItemOutput }>> {
  return mapComConcorrencia(inputs, concurrency, async (input) => {
    const sug = await sugerirNcm(
      {
        descricao: inputParaSugerir(input),
        material: input.material ?? null,
        uso: input.uso ?? null,
        ncmAtual: input.ncmInformado ?? null,
        max: 4,
      },
      catalog,
    );

    if (!sug.ok || !sug.sugestao?.ncm) {
      return {
        ok: false,
        output: saidaPendente(input, sug.erro ?? "Gemini/Lovable indisponível"),
      };
    }

    const conf = sug.sugestao.confianca ?? 0.85;
    const candidatos = [
      {
        ncm: sug.sugestao.ncm,
        descricaoOficial:
          sug.sugestao.descricaoOficial ?? sug.sugestao.descricaoCia ?? undefined,
        confianca: conf,
      },
      ...(sug.alternativas ?? []).map((a, i) => ({
        ncm: a.ncm,
        descricaoOficial: a.descricaoOficial ?? a.descricaoCia ?? undefined,
        confianca: Math.max(0.35, 0.7 - i * 0.1),
      })),
    ];

    const descPt = input.descPtConfirmado?.trim() || input.descOriginal.trim();
    const descDuimp =
      sug.sugestao.descricaoOficial?.trim() ||
      `${descPt} — classificação Gemini (validação Siscomex na resolução).`;

    return {
      ok: true,
      output: {
        descPt,
        descDuimp,
        ncmCandidatos: candidatos,
        justificativaRGI: sug.sugestao.justificativaRGI,
        confiancaPasse2: conf,
        classificacaoBaixaConfianca: conf < 0.6,
        classificacaoProvedor: "gemini",
      },
    };
  });
}
