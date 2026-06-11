/** Resolve função de juiz LLM a partir do provedor configurado. */

import type { LlmCallFn } from "./classificar-ncm-2passes.js";
import type { LlmProvider } from "./types.js";

export function resolverJuizCompatibilidade(provider: LlmProvider): LlmCallFn | undefined {
  if (provider.nome.startsWith("mock")) {
    return criarJuizMock();
  }
  return undefined;
}

/** Mock determinístico — confirma incompatibilidade óbvia (parafuso × farinha). */
function criarJuizMock(): LlmCallFn {
  return async (_system, user) => {
    const payload = JSON.parse(user) as { descricaoProduto?: string; ncm?: string };
    const desc = (payload.descricaoProduto ?? "").toLowerCase();
    const ncm = (payload.ncm ?? "").replace(/\D/g, "");
    if (/parafus|sexav|bolt|screw/.test(desc) && ncm.startsWith("19")) {
      return JSON.stringify({
        status: "incompativel",
        motivo: "Parafuso metálico não corresponde a preparação alimentícia do capítulo 19.",
      });
    }
    return JSON.stringify({
      status: "revisar",
      motivo: "Compatibilidade inconclusiva — revisão manual recomendada.",
    });
  };
}
