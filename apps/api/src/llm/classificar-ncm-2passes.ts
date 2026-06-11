/**
 * Classificação NCM em 2 passes com validação Siscomex.
 * Passe 1: posição 4 dígitos entre candidatos montados.
 * Passe 2: NCM-8 com descricaoCompleta dentro da posição.
 */

import {
  detectarFamilia,
  listarNcm8DaPosicao,
  montarCandidatosPasse1,
  type NcmCatalog,
} from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import {
  buildPasse1Prompt,
  buildPasse2Prompt,
  parsePasse1Response,
  parsePasse2Response,
  SYSTEM_PASSE1,
  SYSTEM_PASSE2,
  type Passe1ItemInput,
  type Passe2ItemInput,
} from "./prompt-2passes.js";

const BAIXA_CONFIANCA = 0.6;

export interface LlmCallFn {
  (system: string, user: string): Promise<string>;
}

/** Executa 2 passes via função de chamada LLM (Anthropic/OpenAI/mock). */
export async function executar2PassesComLlm(
  catalog: NcmCatalog,
  itens: ClassifyItemInput[],
  chamarLlm: LlmCallFn,
): Promise<ClassifyItemOutput[]> {
  const passe1Inputs: Passe1ItemInput[] = itens.map((it, i) => ({
    i,
    descricao: it.descOriginal,
    ncmInformado: it.ncmInformado,
    contexto: it.contexto,
    candidatos: montarCandidatosPasse1(catalog, it.descOriginal, detectarFamilia(it.descOriginal)),
  }));

  for (const p of passe1Inputs) {
    if (!p.candidatos.length) {
      throw new Error(`Sem candidatos de posição para item ${p.i}`);
    }
  }

  const textoP1 = await chamarLlm(SYSTEM_PASSE1, buildPasse1Prompt(passe1Inputs));
  const resP1 = parsePasse1Response(textoP1, itens.length);

  const passe2Inputs: Passe2ItemInput[] = [];
  for (let i = 0; i < itens.length; i++) {
    const p1 = resP1[i]!;
    const candidatos = passe1Inputs[i]!.candidatos;
    let pos4 = p1.posicao4;
    if (!candidatos.some((c) => c.posicao4 === pos4)) {
      pos4 = candidatos[0]!.posicao4;
    }
    const opcoes = listarNcm8DaPosicao(catalog, pos4);
    if (!opcoes.length) throw new Error(`Posição ${pos4} sem NCM-8 vigentes`);
    passe2Inputs.push({
      i,
      descricao: itens[i]!.descOriginal,
      posicao4: pos4,
      ncmInformado: itens[i]!.ncmInformado,
      opcoes,
    });
  }

  const textoP2 = await chamarLlm(SYSTEM_PASSE2, buildPasse2Prompt(passe2Inputs));
  const resP2 = parsePasse2Response(textoP2, itens.length);

  return itens.map((it, i) => {
    const p1 = resP1[i]!;
    const p2 = resP2[i]!;
    const p2Input = passe2Inputs[i]!;
    let ncm = p2.ncm;
    if (!catalog.existe(ncm)) {
      ncm = p2Input.opcoes[0]!.ncm;
    }

    const confianca = p2.confianca;
    const descPt = p2.descPt.trim() || it.descOriginal;
    const descDuimp =
      p2.descDuimp.trim() ||
      `${descPt} — classificação fiscal conforme NCM ${ncm} (Siscomex vigente).`;

    return {
      descPt,
      descDuimp,
      ncmCandidatos: [
        {
          ncm,
          descricaoOficial: catalog.descricao(ncm) ?? undefined,
          confianca,
        },
      ],
      posicaoPasse1: p2Input.posicao4,
      confiancaPasse1: p1.confianca,
      confiancaPasse2: confianca,
      justificativaRGI: p2.justificativaRGI || p1.justificativaRGI,
      classificacaoBaixaConfianca: confianca < BAIXA_CONFIANCA,
    };
  });
}

/** Tenta 2 passes via provider; retorna null se indisponível ou erro. */
export async function classificarItens2Passes(
  provider: LlmProvider,
  catalog: NcmCatalog,
  itens: ClassifyItemInput[],
): Promise<ClassifyItemOutput[] | null> {
  if (provider.classify2Passes) {
    try {
      return await provider.classify2Passes(catalog, itens);
    } catch {
      return null;
    }
  }
  return null;
}

export { montarCandidatosPasse1, listarNcm8DaPosicao } from "@cia/pipeline";
