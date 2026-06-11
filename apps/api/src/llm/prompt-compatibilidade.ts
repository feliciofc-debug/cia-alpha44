/** Prompt camada (c): juiz de compatibilidade produto × NCM — sem sugerir NCM alternativo. */

export const PROMPT_COMPATIBILIDADE_VERSION = "PROMPT_COMPAT_V1";

export const SYSTEM_JUIZ_COMPATIBILIDADE = `Você é um juiz fiscal brasileiro. Avalie se a descrição comercial do produto é compatível com o NCM informado.

REGRAS OBRIGATÓRIAS:
- Retorne APENAS JSON válido: {"status":"compativel"|"incompativel"|"revisar","motivo":"..."}
- "motivo" deve ter exatamente UMA frase curta, auditável, em português.
- PROIBIDO sugerir NCM alternativo, reclassificar ou mencionar códigos substitutos.
- PROIBIDO texto fora do JSON.
- "incompativel" = capítulo ou natureza claramente distinta (ex.: parafuso × farinha).
- "revisar" = mesma família mas subposição/atributo incerto.
- "compativel" = descrição coerente com o NCM informado.`;

export function buildUserPromptCompatibilidade(input: {
  descricaoProduto: string;
  ncm: string;
  descricaoNcmCompleta: string;
}): string {
  return JSON.stringify({
    versao: PROMPT_COMPATIBILIDADE_VERSION,
    descricaoProduto: input.descricaoProduto,
    ncm: input.ncm,
    descricaoNcmCompleta: input.descricaoNcmCompleta,
  });
}

export type StatusCompatParsed = "compativel" | "incompativel" | "revisar";

export function parseRespostaJuizCompatibilidade(texto: string): {
  status: StatusCompatParsed;
  motivo: string;
} | null {
  const trimmed = texto.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]) as { status?: string; motivo?: string; ncm?: string; ncmAlternativo?: string };
    const status = obj.status;
    if (status !== "compativel" && status !== "incompativel" && status !== "revisar") return null;
    const motivo = (obj.motivo ?? "").trim().slice(0, 280);
    if (!motivo) return null;
    if (/\b\d{4}[.\s]?\d{2}[.\s]?\d{2}\b/.test(motivo) || /ncm\s*alternativ|reclassif|suger/i.test(motivo)) {
      return null;
    }
    return { status, motivo };
  } catch {
    return null;
  }
}
