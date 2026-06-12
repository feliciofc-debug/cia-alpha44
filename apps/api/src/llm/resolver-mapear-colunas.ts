/** Expõe callback de mapeamento IA quando há provedor real configurado. */

import type { MapearColunasIAFn } from "@cia/pipeline";
import { criarChamadaAnthropic, criarChamadaOpenAi } from "./llm-chamada.js";
import { criarMapearColunasPlanilha } from "./mapear-colunas-planilha.js";
import type { LlmProvider } from "./types.js";

export function resolverMapearColunasPlanilha(provider: LlmProvider): MapearColunasIAFn | undefined {
  if (!provider.disponivel || provider.nome.startsWith("mock")) return undefined;

  if (provider.nome.startsWith("anthropic")) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return undefined;
    return criarMapearColunasPlanilha(
      criarChamadaAnthropic(key, process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6"),
    );
  }

  if (provider.nome.startsWith("openai")) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return undefined;
    return criarMapearColunasPlanilha(criarChamadaOpenAi(key, process.env.OPENAI_MODEL ?? "gpt-4o-mini"));
  }

  return undefined;
}
