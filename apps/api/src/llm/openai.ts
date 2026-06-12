/** Provedor OpenAI via Chat Completions (JSON mode). Chave: OPENAI_API_KEY. */

import type { NcmCatalog } from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseClassifyResponse } from "./prompt.js";
import { executar2PassesComLlm } from "./classificar-ncm-2passes.js";
import { criarChamadaOpenAi } from "./llm-chamada.js";

export function criarOpenAiProvider(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"): LlmProvider {
  const chamarLlm = criarChamadaOpenAi(apiKey, model);
  return {
    nome: `openai:${model}`,
    disponivel: true,
    chamarLlm,
    async classify(itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      const texto = await chamarLlm(SYSTEM_PROMPT, buildUserPrompt(itens));
      return parseClassifyResponse(texto, itens.length);
    },
    async classify2Passes(catalog: NcmCatalog, itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      return executar2PassesComLlm(catalog, itens, chamarLlm);
    },
  };
}
