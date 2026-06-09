/**
 * Regras Gerais de Interpretação (RGI) e método de classificação NCM/SH.
 * Base: Nomenclatura Comum do Mercosul — Receita Federal / Siscomex Classif.
 */

/** RGIs aplicáveis na classificação de mercadorias (resumo operacional para IA). */
export const RGI_RESUMO = `
REGRAS GERAIS DE INTERPRETAÇÃO (RGI) — aplicar nesta ordem quando relevante:

RGI 1 — Os títulos das Seções, Capítulos e Subcapítulos têm valor legal apenas para referência.
  A classificação é determinada legalmente pelos textos das posições e subposições e pelas Notas de Seção/Capítulo.

RGI 2 — (a) Artigos incompletos ou inacabados com caráter essencial da mercadoria completa classificam-se como completos.
  (b) Misturas e combinações seguem as Notas pertinentes.

RGI 3 — Quando mais de um código puder aplicar:
  (a) preferir o mais específico;
  (b) se empate, preferir o que confere caráter essencial;
  (c) se persistir, preferir o último na ordem numérica.

RGI 4 — Mercadoria semelhante à de outra posição classifica-se junto com ela se a posição não incluir referência a material específico.

RGI 5 — Estojos e embalagens especialmente adaptados classificam-se com a mercadoria (salvo Notas).

RGI 6 — Subposições do mesmo nível comparadas entre si; aplicar RGI 1–5 no nível da subposição.
`.trim();

/** Passos que a IA deve seguir antes de escolher o NCM. */
export const METODO_CLASSIFICACAO = `
MÉTODO OBRIGATÓRIO (para cada item):
1. Identificar: material principal, função, uso, grau de elaboração, se elétrico/LED, se partes ou conjunto.
2. Determinar Capítulo/Posição pelos textos legais (não pelo nome comercial do fornecedor).
3. Aplicar RGI 1 e RGI 6 — escolher subposição de 8 dígitos mais específica.
4. Se houver "contextoSiscomex" com NCMs vigentes, escolher SOMENTE entre esses códigos.
5. Nunca inventar NCM — se incerto, retornar ncmCandidatos vazio e confiança baixa.
6. Se ncmInformado da planilha constar no contexto Siscomex e for coerente com o produto, priorizá-lo.
`.trim();

export function montarSystemPromptClassificacao(): string {
  return [
    "Você é especialista em classificação fiscal NCM/SH para importação brasileira (Receita Federal / Siscomex).",
    "Para cada item: traduza (descPt), gere descDuimp defensável, sugira 1–3 NCMs candidatos (8 dígitos).",
    RGI_RESUMO,
    METODO_CLASSIFICACAO,
    "Responda APENAS JSON válido, sem texto fora do JSON.",
  ].join("\n\n");
}
