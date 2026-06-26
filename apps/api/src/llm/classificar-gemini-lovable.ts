/**
 * Classificação NCM via Gemini/Lovable — após planilha cliente e cache; antes do fluxo legado.
 */

import {
  detectarFamilias,
  ncmCoerenteComFamilia,
  resolverDescPtFornecedor,
  type NcmCatalog,
} from "@cia/pipeline";
import { sugerirNcm } from "../services/ncm-helper.js";
import { mapComConcorrencia } from "../util/map-concorrencia.js";
import type { ClassifyItemInput, ClassifyItemOutput } from "./types.js";

const AVISO_PENDENTE = "Classificação pendente — revisar";
const CONFIANCA_MIN_VISAO_DIVERGENTE = 0.9;

export function geminiClassificacaoHabilitada(): boolean {
  const p = (process.env.CLASSIFICACAO_NCM_PROVIDER ?? "gemini").toLowerCase();
  if (p === "off" || p === "legacy" || p === "anthropic" || p === "2passes") return false;
  return p === "gemini" || p === "lovable" || p === "auto";
}

export function geminiVisaoHabilitada(): boolean {
  const v = String(process.env.CLASSIFICACAO_NCM_VISION ?? "").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function saidaPendente(input: ClassifyItemInput, aviso?: string): ClassifyItemOutput {
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(
    input.descOriginal,
    input.descPtConfirmado,
  );
  return {
    descPt,
    descDuimp: `${descPt} — ${aviso ?? AVISO_PENDENTE}.`,
    ncmCandidatos: [],
    classificacaoBaixaConfianca: true,
    classificacaoProvedor: "gemini",
    avisoTraducao: aviso ?? avisoTraducao,
  };
}

function inputParaSugerir(input: ClassifyItemInput): string {
  const { descPt } = resolverDescPtFornecedor(input.descOriginal, input.descPtConfirmado);
  const partes = [descPt.trim()];
  if (input.material?.trim()) partes.push(`Material: ${input.material.trim()}`);
  if (input.uso?.trim()) partes.push(`Uso: ${input.uso.trim()}`);
  if (input.fotoBase64 && geminiVisaoHabilitada()) {
    partes.push(
      "Imagem anexada: use somente para refinar atributos dentro da família textual; se divergir de capítulo/família, sinalize revisão.",
    );
  }
  return partes.join(" · ");
}

function candidatoDivergeDaFamiliaTextual(input: ClassifyItemInput, ncm: string): boolean {
  const { descPt } = resolverDescPtFornecedor(input.descOriginal, input.descPtConfirmado);
  const texto = `${input.descOriginal} ${descPt} ${input.uso ?? ""}`.toLowerCase();
  const prefixosExplicitos: string[] = [];
  if (/balan[cç]a|pesagem|scale|挂钩秤/.test(texto)) prefixosExplicitos.push("8423");
  if (/air\s*fryer|fritadeira|pipoqueir|pipoca|popcorn/.test(texto)) prefixosExplicitos.push("8516");
  if (prefixosExplicitos.length && !prefixosExplicitos.some((p) => ncm.startsWith(p))) {
    return true;
  }
  const det = detectarFamilias({ descOriginal: `${input.descOriginal} ${descPt}`, uso: input.uso });
  const familia = det.conflito ? null : (det.familias[0]?.familia ?? null);
  return Boolean(familia && !ncmCoerenteComFamilia(ncm, familia));
}

/** Classifica lote via Lovable/Gemini (paralelo). Retorna ok=false → caller faz fallback legado. */
export async function classificarItensGeminiLote(
  inputs: ClassifyItemInput[],
  catalog: NcmCatalog,
  concurrency = 6,
): Promise<Array<{ ok: boolean; output: ClassifyItemOutput }>> {
  return mapComConcorrencia(inputs, concurrency, async (input) => {
    const usarVisao = geminiVisaoHabilitada() && Boolean(input.fotoBase64);
    const sug = await sugerirNcm(
      {
        descricao: inputParaSugerir(input),
        material: input.material ?? null,
        uso: input.uso ?? null,
        ncmAtual: input.ncmInformado ?? null,
        max: 4,
        ...(usarVisao
          ? {
              imagemBase64: input.fotoBase64,
              imagemMime: input.fotoMime ?? "image/jpeg",
            }
          : {}),
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
    const visaoDivergeDaFamiliaTextual = usarVisao && candidatoDivergeDaFamiliaTextual(input, sug.sugestao.ncm);

    if (visaoDivergeDaFamiliaTextual && conf < CONFIANCA_MIN_VISAO_DIVERGENTE) {
      return {
        ok: false,
        output: saidaPendente(
          input,
          `Imagem divergiu radicalmente da família textual ao sugerir ${sug.sugestao.ncm} com baixa confiança (${conf.toFixed(2)}) — revisar manualmente.`,
        ),
      };
    }

    const avisoVisaoPrevaleceu = visaoDivergeDaFamiliaTextual
      ? `Visão prevaleceu — conferir: sugestão visual ${sug.sugestao.ncm} com confiança ${conf.toFixed(2)} diverge da família textual.`
      : undefined;
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

    const { descPt, avisoTraducao } = resolverDescPtFornecedor(
      input.descOriginal,
      input.descPtConfirmado,
    );
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
        ...(avisoVisaoPrevaleceu ? { avisoAtributo: avisoVisaoPrevaleceu } : {}),
        ...(avisoTraducao ? { avisoTraducao } : {}),
      },
    };
  });
}
