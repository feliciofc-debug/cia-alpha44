/**
 * Classificação NCM em 2 passes com validação Siscomex.
 * Passe 0: tradução → descPt
 * Passe 1: posição 4 dígitos entre candidatos montados (busca em descPt)
 * Passe 2: NCM-8 com descricaoCompleta dentro da posição
 */

import {
  detectarFamilia,
  listarNcm8DaPosicao,
  montarCandidatosPasse1,
  textoClassificacaoIa,
  type NcmCatalog,
} from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import {
  buildPasse1Prompt,
  buildPasse2Prompt,
  buildTranslatePrompt,
  parsePasse1Response,
  parsePasse2Response,
  parseTranslateResponse,
  SYSTEM_PASSE1,
  SYSTEM_PASSE2,
  SYSTEM_TRANSLATE,
  type Passe1ItemInput,
  type Passe2ItemInput,
} from "./prompt-2passes.js";

const BAIXA_CONFIANCA = 0.6;
const AVISO_PENDENTE = "Classificação pendente — revisar";
export const AVISO_TRADUCAO_INDISPONIVEL =
  "Tradução indisponível — classificação usando descrição original.";

export interface LlmCallFn {
  (system: string, user: string): Promise<string>;
}

function descricaoIa(it: ClassifyItemInput, descPt: string): string {
  return textoClassificacaoIa({
    descOriginal: it.descOriginal,
    descPt,
    material: it.material,
    uso: it.uso,
  });
}

function saidaPendente(it: ClassifyItemInput, descPt: string): ClassifyItemOutput {
  return {
    descPt,
    descDuimp: `${descPt} — ${AVISO_PENDENTE}.`,
    ncmCandidatos: [],
    classificacaoBaixaConfianca: true,
    justificativaRGI: "Sem candidatos válidos — classificação pendente.",
  };
}

interface TraducaoResult {
  descricoes: string[];
  traducaoIndisponivel: boolean;
}

function fallbackTraducao(itens: ClassifyItemInput[]): TraducaoResult {
  return {
    descricoes: itens.map((it) => it.descOriginal),
    traducaoIndisponivel: true,
  };
}

async function traduzirDescricoes(
  itens: ClassifyItemInput[],
  chamarLlm: LlmCallFn,
): Promise<TraducaoResult> {
  try {
    const texto = await chamarLlm(
      SYSTEM_TRANSLATE,
      buildTranslatePrompt(
        itens.map((it, i) => ({
          i,
          descOriginal: it.descOriginal,
          material: it.material,
          uso: it.uso,
        })),
      ),
    );
    try {
      const traduzidos = parseTranslateResponse(texto, itens.length);
      return {
        descricoes: traduzidos.map((pt, i) => pt || itens[i]!.descOriginal),
        traducaoIndisponivel: false,
      };
    } catch {
      return fallbackTraducao(itens);
    }
  } catch {
    return fallbackTraducao(itens);
  }
}

/** Executa 2 passes via função de chamada LLM (Anthropic/OpenAI/mock). */
export async function executar2PassesComLlm(
  catalog: NcmCatalog,
  itens: ClassifyItemInput[],
  chamarLlm: LlmCallFn,
): Promise<ClassifyItemOutput[]> {
  const { descricoes: descricoesPt, traducaoIndisponivel } = await traduzirDescricoes(itens, chamarLlm);
  const avisoTraducao = traducaoIndisponivel ? AVISO_TRADUCAO_INDISPONIVEL : undefined;
  const resultados: ClassifyItemOutput[] = itens.map((it, i) => ({
    ...saidaPendente(it, descricoesPt[i]!),
    avisoTraducao,
  }));

  const passe1Inputs: Passe1ItemInput[] = [];
  const indicesAtivos: number[] = [];

  for (let i = 0; i < itens.length; i++) {
    const it = itens[i]!;
    const descPt = descricoesPt[i]!;
    const descBusca = traducaoIndisponivel ? it.descOriginal : descPt;
    const desc = descricaoIa(it, descPt);
    const detInput = { descOriginal: descBusca, uso: it.uso };
    const candidatos = montarCandidatosPasse1(
      catalog,
      descBusca,
      detectarFamilia(detInput),
      undefined,
      detInput,
    );
    if (!candidatos.length) continue;
    indicesAtivos.push(i);
    passe1Inputs.push({
      i,
      descricao: desc,
      ncmInformado: it.ncmInformado,
      contexto: it.contexto,
      candidatos,
    });
  }

  if (!passe1Inputs.length) return resultados;

  const textoP1 = await chamarLlm(SYSTEM_PASSE1, buildPasse1Prompt(passe1Inputs));
  const resP1 = parsePasse1Response(textoP1, passe1Inputs.length);

  const passe2Inputs: Passe2ItemInput[] = [];
  const indicesPasse2: number[] = [];

  for (let j = 0; j < passe1Inputs.length; j++) {
    const p1 = resP1[j]!;
    const itemIdx = indicesAtivos[j]!;
    const candidatos = passe1Inputs[j]!.candidatos;
    const pos4Valida = candidatos.some((c) => c.posicao4 === p1.posicao4);
    if (!pos4Valida) continue;
    const opcoes = listarNcm8DaPosicao(catalog, p1.posicao4);
    if (!opcoes.length) continue;
    indicesPasse2.push(itemIdx);
    passe2Inputs.push({
      i: itemIdx,
      descricao: descricaoIa(itens[itemIdx]!, descricoesPt[itemIdx]!),
      posicao4: p1.posicao4,
      ncmInformado: itens[itemIdx]!.ncmInformado,
      opcoes,
    });
  }

  if (!passe2Inputs.length) return resultados;

  const textoP2 = await chamarLlm(SYSTEM_PASSE2, buildPasse2Prompt(passe2Inputs));
  const resP2 = parsePasse2Response(textoP2, passe2Inputs.length);

  for (let k = 0; k < passe2Inputs.length; k++) {
    const itemIdx = indicesPasse2[k]!;
    const p2Input = passe2Inputs[k]!;
    const p1Idx = indicesAtivos.indexOf(itemIdx);
    const p1 = p1Idx >= 0 ? resP1[p1Idx]! : { confianca: 0, justificativaRGI: "" };
    const p2 = resP2[k]!;
    const it = itens[itemIdx]!;
    const descPt = descricoesPt[itemIdx]!;

    const ncmValido = catalog.existe(p2.ncm) && p2Input.opcoes.some((o) => o.ncm === p2.ncm);
    if (!ncmValido) continue;

    const confianca = p2.confianca;
    const descDuimp =
      p2.descDuimp.trim() ||
      `${descPt} — classificação fiscal conforme NCM ${p2.ncm} (Siscomex vigente).`;

    resultados[itemIdx] = {
      descPt: p2.descPt.trim() || descPt,
      descDuimp,
      ncmCandidatos: [
        {
          ncm: p2.ncm,
          descricaoOficial: catalog.descricao(p2.ncm) ?? undefined,
          confianca,
        },
      ],
      posicaoPasse1: p2Input.posicao4,
      confiancaPasse1: p1.confianca,
      confiancaPasse2: confianca,
      justificativaRGI: p2.justificativaRGI || p1.justificativaRGI,
      classificacaoBaixaConfianca: confianca < BAIXA_CONFIANCA,
      avisoMaterial: p2.avisoMaterial,
      avisoAtributo: p2.avisoAtributo,
      avisoTraducao,
    };
  }

  return resultados;
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
