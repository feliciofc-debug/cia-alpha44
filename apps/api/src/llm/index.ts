/**
 * Seleção do provedor de IA por ambiente, com fallback automático para o mock.
 *
 * LLM_PROVIDER = anthropic | openai | mock (default: auto-detecta pela chave).
 * O mock nunca falha e mantém o sistema 100% funcional sem chave — argumento de
 * venda: "traga sua própria chave de IA".
 */

import type { ComexEntry } from "@cia/pipeline";
import type { LlmProvider } from "./types.js";
import { criarMockProvider } from "./mock.js";
import { criarAnthropicProvider } from "./anthropic.js";
import { criarOpenAiProvider } from "./openai.js";

export * from "./types.js";

export function escolherProvider(seed: ComexEntry[]): LlmProvider {
  const escolha = (process.env.LLM_PROVIDER ?? "auto").toLowerCase();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.replace(/\s/g, "");
  const openaiKey = process.env.OPENAI_API_KEY?.replace(/\s/g, "");
  const mock = criarMockProvider(seed);

  try {
    if (escolha === "anthropic" && anthropicKey) return criarAnthropicProvider(anthropicKey);
    if (escolha === "openai" && openaiKey) return criarOpenAiProvider(openaiKey);
    if (escolha === "auto") {
      if (anthropicKey) return criarAnthropicProvider(anthropicKey);
      if (openaiKey) return criarOpenAiProvider(openaiKey);
    }
  } catch {
    return mock;
  }
  return mock;
}

/** Mensagem curta para log de fallback (sem credenciais). */
function motivoFallback(e: unknown): string {
  if (e instanceof Error) return e.message.slice(0, 200);
  return String(e).slice(0, 200);
}

/** Envolve um provider para nunca derrubar a requisição: em erro, cai no mock. */
export function comFallback(primario: LlmProvider, mock: LlmProvider): LlmProvider {
  if (!primario.disponivel) return primario;
  return {
    nome: primario.nome,
    disponivel: primario.disponivel,
    chamarLlm: primario.chamarLlm,
    async classify(itens) {
      try {
        return await primario.classify(itens);
      } catch (e) {
        console.warn(`[LLM fallback] ${primario.nome} classify → mock: ${motivoFallback(e)}`);
        return mock.classify(itens);
      }
    },
    async classify2Passes(catalog, itens) {
      if (primario.classify2Passes) {
        try {
          return await primario.classify2Passes(catalog, itens);
        } catch (e) {
          console.warn(`[LLM fallback] ${primario.nome} classify2Passes → mock: ${motivoFallback(e)}`);
          return mock.classify2Passes!(catalog, itens);
        }
      }
      return mock.classify2Passes!(catalog, itens);
    },
  };
}
