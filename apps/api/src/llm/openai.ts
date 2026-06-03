/** Provedor OpenAI via Chat Completions (JSON mode). Chave: OPENAI_API_KEY. */

import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseClassifyResponse } from "./prompt.js";

export function criarOpenAiProvider(apiKey: string, model = process.env.OPENAI_MODEL ?? "gpt-4o-mini"): LlmProvider {
  return {
    nome: `openai:${model}`,
    disponivel: true,
    async classify(itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(itens) },
          ],
        }),
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const texto = data.choices?.[0]?.message?.content ?? "";
      return parseClassifyResponse(texto, itens.length);
    },
  };
}
