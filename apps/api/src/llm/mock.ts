/**
 * Provedor MOCK — funciona sem nenhuma chave de IA.
 *
 * Não inventa tradução: mantém a descrição original e gera uma descrição DUIMP
 * templada. Para o NCM, faz um match ingênuo por sobreposição de palavras contra
 * as descrições do seed ComexStat (útil para demo). Marca confiança baixa e deixa
 * explícito que é heurística sem IA — coerente com a regra de honestidade.
 */

import { detectarFamilia, type ComexEntry } from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
}

export function criarMockProvider(seed: ComexEntry[]): LlmProvider {
  const seedTokens = seed.map((e) => ({ entry: e, toks: new Set(tokens(e.desc)) }));

  return {
    nome: "mock (sem IA)",
    disponivel: false,
    async classify(itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      return itens.map((it) => {
        const qt = tokens(it.descOriginal);
        let melhor: { ncm: string; desc: string; score: number } | null = null;
        if (qt.length) {
          const qset = new Set(qt);
          for (const { entry, toks } of seedTokens) {
            let inter = 0;
            for (const t of qset) if (toks.has(t)) inter++;
            if (inter > 0) {
              const score = inter / Math.max(1, qset.size);
              if (!melhor || score > melhor.score) melhor = { ncm: entry.ncm, desc: entry.desc, score };
            }
          }
        }
        const candidatos = [];
        const desc = it.descOriginal ?? "";
        const familia = detectarFamilia(desc);
        const capEsperado = familia?.capitulo ?? it.ncmInformado?.replace(/\D/g, "").slice(0, 4);

        if (/lustre|lumin[aá]ria|chandelier|wall lamp|aisle light|pendente|ceiling light/i.test(desc)) {
          candidatos.push({
            ncm: "94052100",
            descricaoOficial: "Luminárias elétricas de teto/parede (LED)",
            confianca: 0.88,
          });
        }
        if (melhor && melhor.score >= 0.4 && (!capEsperado || melhor.ncm.startsWith(capEsperado))) {
          candidatos.push({
            ncm: melhor.ncm,
            descricaoOficial: melhor.desc,
            confianca: Math.min(0.5, melhor.score),
          });
        }
        return {
          descPt: it.descOriginal,
          descDuimp:
            `${it.descOriginal} — descrição técnica pendente de IA (configure uma chave Anthropic/OpenAI para tradução e DUIMP automáticas).`,
          ncmCandidatos: candidatos,
        };
      });
    },
  };
}
