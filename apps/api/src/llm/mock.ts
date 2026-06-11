/**
 * Provedor MOCK — funciona sem nenhuma chave de IA.
 * Inclui classify2Passes determinístico para CI estável.
 */

import {
  listarNcm8DaPosicao,
  montarCandidatosPasse1,
  prefixosDasFamilias,
  detectarFamilias,
  type ComexEntry,
  type NcmCatalog,
} from "@cia/pipeline";
import type { ClassifyItemInput, ClassifyItemOutput, LlmProvider } from "./types.js";

function tokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
}

function normDesc(desc: string): string {
  return desc
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Respostas determinísticas 2 passes para produtos-teste (CI). */
function mock2PassesItem(catalog: NcmCatalog, it: ClassifyItemInput): ClassifyItemOutput {
  const desc = normDesc(it.descOriginal);

  let posicao4 = "";
  let ncm = "";
  let confianca = 0.88;
  let justificativaRGI = "RGI 3a — subposição mais específica";
  let avisoMaterial: string | undefined;
  let avisoAtributo: string | undefined;

  const rgiExclusao9401 =
    "9401.61/69 (outros assentos) e 9401.71/79 (metal) não se aplicam — produto é assento giratório de altura ajustável (9401.3x).";

  if (/garrafa|termic|termo|thermal|flask|isoterm|vacuum|inox/.test(desc)) {
    posicao4 = "9617";
    ncm = "96170010";
    justificativaRGI =
      "RGI 1 — garrafa térmica com isolamento a vácuo; cap. 9617 (recipientes isotérmicos), não 7323 (artigo de uso doméstico comum).";
  } else if (/fone|bluetooth|earphone|tws|auscultador|headphone|headset/.test(desc)) {
    posicao4 = "8518";
    ncm = "85183000";
    justificativaRGI = "RGI 1 — fones de ouvido, mesmo combinados com microfone (8518.30).";
  } else if (/cadeira|chair|escritorio|office|girator|rotativ|swivel/.test(desc)) {
    posicao4 = "9401";
    const alturaAjust = /altura\s*ajust|height\s*adjust|adjustable\s*height/.test(desc);
    if (/madeira|wood|madera/.test(desc) && alturaAjust) {
      ncm = "94013100";
      justificativaRGI = `RGI 1 + RGI 6 — assento giratório de altura ajustável, madeira (9401.31). ${rgiExclusao9401}`;
    } else if (/estofad|metalic|metal|aco|aço|aluminio|polipropilen|plastic/.test(desc)) {
      ncm = "94013900";
      if (!alturaAjust) {
        avisoAtributo =
          "atributo determinante não informado: altura ajustável — confirme para validar a subposição";
        confianca = 0.55;
      }
      justificativaRGI = `RGI 1 + RGI 6 — assento giratório estofado, base metálica (9401.39). ${rgiExclusao9401}`;
    } else {
      ncm = "94013900";
      confianca = 0.55;
      avisoMaterial = "material não informado — classificação assume estofado com base metálica (9401.39)";
      if (!alturaAjust) {
        avisoAtributo =
          "atributo determinante não informado: altura ajustável — confirme para validar a subposição";
      }
      justificativaRGI = `RGI 1 + RGI 6 — assento giratório; material não especificado (9401.39). ${rgiExclusao9401}`;
    }
  } else if (/lustre|lumin[aá]ria|chandelier|wall lamp|pendente|ceiling light/i.test(it.descOriginal)) {
    posicao4 = "9405";
    ncm = "94052100";
    justificativaRGI = "RGI 1 — luminária elétrica de teto/parede.";
  } else {
    const cands = montarCandidatosPasse1(catalog, it.descOriginal);
    posicao4 = cands[0]?.posicao4 ?? "9405";
    const opcoes = listarNcm8DaPosicao(catalog, posicao4);
    ncm = opcoes[0]?.ncm ?? "";
    confianca = 0.45;
    justificativaRGI = "RGI 6 — fallback mock por busca Siscomex.";
  }

  if (!catalog.existe(ncm)) {
    const opcoes = listarNcm8DaPosicao(catalog, posicao4 || ncm.slice(0, 4));
    ncm = opcoes[0]?.ncm ?? ncm;
  }

  const descPt = it.descOriginal;
  return {
    descPt,
    descDuimp: `${descPt} — classificação mock (configure IA para DUIMP automática).`,
    ncmCandidatos: [
      {
        ncm,
        descricaoOficial: catalog.descricao(ncm) ?? undefined,
        confianca,
      },
    ],
    posicaoPasse1: posicao4,
    confiancaPasse1: confianca,
    confiancaPasse2: confianca,
    justificativaRGI,
    classificacaoBaixaConfianca: confianca < 0.6,
    avisoMaterial,
    avisoAtributo,
  };
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
          for (const { entry, toks: st } of seedTokens) {
            let inter = 0;
            for (const t of qset) if (st.has(t)) inter++;
            if (inter > 0) {
              const score = inter / Math.max(1, qset.size);
              if (!melhor || score > melhor.score) melhor = { ncm: entry.ncm, desc: entry.desc, score };
            }
          }
        }
        const candidatos = [];
        const desc = it.descOriginal ?? "";
        const det = detectarFamilias(desc);
        const familia = det.familias[0]?.familia ?? null;
        const caps = det.familias.length ? prefixosDasFamilias(det.familias.map((f) => f.familia)) : [];
        const capEsperado = caps[0] ?? familia?.prefixos[0] ?? it.ncmInformado?.replace(/\D/g, "").slice(0, 4);

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
    async classify2Passes(catalog: NcmCatalog, itens: ClassifyItemInput[]): Promise<ClassifyItemOutput[]> {
      return itens.map((it) => mock2PassesItem(catalog, it));
    },
  };
}
