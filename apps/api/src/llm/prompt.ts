/** Prompt compartilhado de classificação (tradução + NCM + DUIMP) em JSON estruturado. */

import type { ClassifyItemInput, ClassifyItemOutput } from "./types.js";
import { montarSystemPromptClassificacao } from "./ncm-regras.js";

export const SYSTEM_PROMPT = montarSystemPromptClassificacao();

export function buildUserPrompt(itens: ClassifyItemInput[]): string {
  const lista = itens.map((it, i) => ({
    i,
    descricao: it.descOriginal,
    ncmInformado: it.ncmInformado ?? null,
    contextoSiscomex: it.contexto ?? null,
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
