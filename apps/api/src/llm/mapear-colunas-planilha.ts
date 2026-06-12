/** Mapeamento de colunas de planilha por IA (1 chamada — cabeçalho + amostras). */

import type { ColunaDetectada, EntradaMapeamentoIA, MapeamentoColunasIA } from "@cia/pipeline";
import type { LlmCallFn } from "./classificar-ncm-2passes.js";

const CAMPOS: ColunaDetectada[] = [
  "descricao",
  "qtd",
  "preco",
  "peso",
  "peso_bruto",
  "fob",
  "ncm",
  "dimensoes",
];

const SYSTEM = `Você mapeia colunas de planilha de fornecedor para um schema fixo.
Responda APENAS JSON: { "descricao": 0, "qtd": 2, ... } com índices 0-based das colunas.
Use só estes campos quando existirem: ${CAMPOS.join(", ")}.
Omita campos que não existirem. Não invente colunas.`;

function buildPrompt(entrada: EntradaMapeamentoIA): string {
  const headers = entrada.headers.map((h, i) => `${i}: ${h}`).join("\n");
  const amostras = entrada.amostras
    .map((row, ri) => `Linha ${ri + 1}: ${JSON.stringify(row)}`)
    .join("\n");
  return `Cabeçalhos:\n${headers}\n\nAmostras:\n${amostras}\n\nRetorne JSON com índices das colunas.`;
}

function parseResposta(texto: string): MapeamentoColunasIA | null {
  const m = texto.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const raw = JSON.parse(m[0]) as Record<string, unknown>;
    const out: MapeamentoColunasIA = {};
    for (const campo of CAMPOS) {
      const v = raw[campo];
      if (typeof v === "number" && Number.isInteger(v) && v >= 0) {
        out[campo] = v;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function criarMapearColunasPlanilha(chamarLlm: LlmCallFn) {
  return async (entrada: EntradaMapeamentoIA): Promise<MapeamentoColunasIA | null> => {
    const texto = await chamarLlm(SYSTEM, buildPrompt(entrada));
    return parseResposta(texto);
  };
}
