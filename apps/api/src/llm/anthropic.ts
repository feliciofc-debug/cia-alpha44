/** Provedor Anthropic (Claude) via API de Messages. Chave: ANTHROPIC_API_KEY. */

import type { NcmCatalog } from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseClassifyResponse } from "./prompt.js";
import { executar2PassesComLlm } from "./classificar-ncm-2passes.js";
import { criarChamadaAnthropic } from "./llm-chamada.js";

export function criarAnthropicProvider(apiKey: string, model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"): LlmProvider {
  const chamarLlm = criarChamadaAnthropic(apiKey, model);
  return {
    nome: `anthropic:${model}`,
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
