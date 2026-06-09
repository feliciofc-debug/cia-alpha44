/** Prompt compartilhado de classificação (tradução + NCM + DUIMP) em JSON estruturado. */

import type { ClassifyItemInput, ClassifyItemOutput } from "./types.js";

export const SYSTEM_PROMPT = `Você é um especialista em comércio exterior brasileiro (classificação fiscal NCM/SH e descrição DUIMP).
Para cada item de uma planilha de fornecedor estrangeiro, você deve:
1. Traduzir a descrição para PT-BR técnico (campo "descPt").
2. Gerar uma descrição DUIMP detalhada e defensável (material, função, características — campo "descDuimp").
3. Sugerir de 1 a 3 NCMs candidatos (8 dígitos) com a descrição oficial e um nível de confiança 0..1.
IMPORTANTE: sugira APENAS códigos NCM de 8 dígitos que existam na Nomenclatura Comum do Mercosul vigente.
Se a planilha já informa um NCM (ncmInformado), inclua-o como candidato principal — não substitua por outro capítulo.
Responda APENAS com JSON válido, sem texto fora do JSON.`;

export function buildUserPrompt(itens: ClassifyItemInput[]): string {
  const lista = itens.map((it, i) => ({
    i,
    descricao: it.descOriginal,
    ncmInformado: it.ncmInformado ?? null,
  }));
  return (
    `Itens (array JSON):\n${JSON.stringify(lista, null, 0)}\n\n` +
    `Responda com um objeto JSON no formato:\n` +
    `{"itens":[{"i":0,"descPt":"...","descDuimp":"...","ncmCandidatos":[{"ncm":"00000000","descricaoOficial":"...","confianca":0.0}]}]}`
  );
}

/** Extrai o JSON da resposta (tolerante a cercas de código) e normaliza a saída. */
export function parseClassifyResponse(texto: string, qtd: number): ClassifyItemOutput[] {
  const limpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  let obj: unknown;
  try {
    obj = JSON.parse(limpo);
  } catch {
    const m = limpo.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Resposta da IA não é JSON válido.");
    obj = JSON.parse(m[0]);
  }
  const arr = (obj as { itens?: unknown[] }).itens ?? [];
  const out: ClassifyItemOutput[] = [];
  for (let i = 0; i < qtd; i++) {
    const r = (arr[i] ?? {}) as Record<string, unknown>;
    const cands = Array.isArray(r.ncmCandidatos) ? r.ncmCandidatos : [];
    out.push({
      descPt: String(r.descPt ?? ""),
      descDuimp: String(r.descDuimp ?? ""),
      ncmCandidatos: cands.slice(0, 3).map((c) => {
        const cc = c as Record<string, unknown>;
        return {
          ncm: String(cc.ncm ?? "").replace(/\D/g, ""),
          descricaoOficial: cc.descricaoOficial ? String(cc.descricaoOficial) : undefined,
          confianca: Math.max(0, Math.min(1, Number(cc.confianca ?? 0))),
        };
      }),
    });
  }
  return out;
}
