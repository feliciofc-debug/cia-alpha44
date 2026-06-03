/** Provedor Anthropic (Claude) via API de Messages. Chave: ANTHROPIC_API_KEY. */

import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseClassifyResponse } from "./prompt.js";

export function criarAnthropicProvider(apiKey: string, model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest"): LlmProvider {
  return {
    nome: `anthropic:${model}`,
    disponivel: true,
    async classify(itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildUserPrompt(itens) }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { content?: Array<{ text?: string }> };
      const texto = data.content?.map((c) => c.text ?? "").join("") ?? "";
      return parseClassifyResponse(texto, itens.length);
    },
  };
}
