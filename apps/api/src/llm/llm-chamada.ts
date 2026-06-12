/** Helpers compartilhados para chamadas LLM em 2 passes. */

import type { LlmCallFn } from "./classificar-ncm-2passes.js";

/** Remove whitespace acidental (CRLF no env, newline no meio da chave). */
export function limparChaveApi(key: string): string {
  let k = key.replace(/\s/g, "");
  // Corrupção conhecida: ...AA + CR + 'n' no api.env → 109 chars inválidos
  if (k.length === 109 && k.endsWith("n") && k.slice(-3, -1) === "AA") {
    k = k.slice(0, -1);
  }
  return k;
}

export function criarChamadaAnthropic(apiKey: string, model: string): LlmCallFn {
  const key = limparChaveApi(apiKey);
  return async (system: string, user: string) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { content?: Array<{ text?: string }> };
    return data.content?.map((c) => c.text ?? "").join("") ?? "";
  };
}

export function criarChamadaOpenAi(apiKey: string, model: string): LlmCallFn {
  const key = limparChaveApi(apiKey);
  return async (system: string, user: string) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? "";
  };
}
