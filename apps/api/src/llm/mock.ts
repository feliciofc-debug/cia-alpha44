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
import { traduzirDescricaoClassificacaoMock } from "./traducao-classificacao-mock.js";

const AVISO_PENDENTE = "Classificação pendente — revisar";

function saidaPendente(descOriginal: string, descPt: string): ClassifyItemOutput {
  return {
    descPt,
    descDuimp: `${descPt} — ${AVISO_PENDENTE}.`,
    ncmCandidatos: [],
    classificacaoBaixaConfianca: true,
    justificativaRGI: "Sem candidatos válidos — classificação pendente.",
  };
}

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
  const descPt = traduzirDescricaoClassificacaoMock(it.descOriginal);
  const desc = normDesc(`${descPt} ${it.descOriginal}`);

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
  } else if (
    (/滑板车|500w|10寸|es-t19|scooter|patinete/i.test(desc) || /500w/i.test(it.descOriginal)) &&
    /骑行/.test(it.uso ?? "")
  ) {
    posicao4 = "8711";
    ncm = "87116000";
    confianca = 0.92;
    justificativaRGI =
      "RGI 1 — scooter/patinete elétrico completo (87.11.60); material estrutural não altera capítulo do veículo.";
  } else if (/bohrschrauber|parafusadeira sem fio|parafusadeira/.test(desc)) {
    posicao4 = "8467";
    ncm = listarNcm8DaPosicao(catalog, posicao4).find((o) => o.ncm.startsWith("8467"))?.ncm ?? "";
    confianca = 0.82;
    justificativaRGI = "RGI 1 — ferramenta elétrica portátil (84.67).";
  } else if (/螺丝|parafuso|bolt|screw/i.test(desc) || /螺丝/.test(it.descOriginal)) {
    posicao4 = "7318";
    ncm = "73181500";
    confianca = 0.9;
    justificativaRGI =
      "Nota 2 Seção XVII — parafuso de uso geral (73.18), não parte identificável de veículo (87.14).";
  } else if (/适配器|carregador|charger|adaptador/i.test(desc) || /适配器/.test(it.descOriginal)) {
    posicao4 = "8504";
    ncm = "85044010";
    confianca = 0.91;
    justificativaRGI =
      "Nota 2 Seção XVII — carregador/adaptador elétrico (85.04.40), não parte de veículo (87.14).";
  } else if (
    (/减震|amortecedor|shock\s*absorber/.test(desc) ||
      (/配件|spare\s*part/.test(desc) && /patinete|scooter|滑板|8711|8712|8713|ve[ií]culo/.test(desc))) &&
    !/autom[oó]vel|passenger\s*car|8701|8702|8703|8704|8705/.test(desc)
  ) {
    posicao4 = "8714";
    ncm = "87141000";
    confianca = 0.88;
    justificativaRGI =
      "RGI 1 — parte/acessório de patinete/scooter (87.11–87.13) → 8714.10; 87.08 exclusiva para automóveis 87.01–87.05.";
  } else if (
    /减震|amortecedor|shock\s*absorber|配件|spare\s*part/.test(desc) ||
    /铁|配件/.test(`${it.material ?? ""} ${it.uso ?? ""}`)
  ) {
    posicao4 = "8714";
    ncm = "87141000";
    confianca = 0.82;
    justificativaRGI =
      "RGI 1 — parte/acessório de veículo leve (8714), coerente com material ferro e uso 配件.";
  } else if (/schraubendreher|chave de fenda|jogo de chaves/.test(desc)) {
    posicao4 = "8205";
    ncm = listarNcm8DaPosicao(catalog, posicao4)[0]?.ncm ?? "";
    confianca = 0.8;
    justificativaRGI = "RGI 1 — ferramentas manuais (82.05).";
  } else if (/kochtopf|panelas|jogo de panelas/.test(desc)) {
    posicao4 = "7323";
    ncm = listarNcm8DaPosicao(catalog, posicao4)[0]?.ncm ?? "";
    confianca = 0.78;
    justificativaRGI = "RGI 1 — artigos de uso doméstico de aço inox (73.23).";
  } else if (/deckenleuchte|luminaria de teto|luminária de teto|led/.test(desc) && /teto|ceiling|decken/.test(desc)) {
    posicao4 = "9405";
    ncm = "94052100";
    justificativaRGI = "RGI 1 — luminária elétrica de teto/parede.";
  } else if (/elektroroller|patinete eletrico|patinete elétrico|scooter 350/.test(desc)) {
    posicao4 = "8711";
    ncm = "87116000";
    confianca = 0.9;
    justificativaRGI = "RGI 1 — veículo elétrico de duas rodas (87.11.60).";
  } else if (/kinderroller|patinete infantil|3 rodas/.test(desc)) {
    posicao4 = "9503";
    ncm = listarNcm8DaPosicao(catalog, posicao4).find((o) => o.folha.match(/patinete|scooter|rodas/i))?.ncm
      ?? listarNcm8DaPosicao(catalog, posicao4)[0]?.ncm
      ?? "";
    confianca = 0.75;
    justificativaRGI = "RGI 1 — brinquedo/patinete infantil (95.03).";
  } else if (/stossdampfer|stoßdämpfer|amortecedor.*patinete|amortecedor traseiro/.test(desc)) {
    posicao4 = "8714";
    ncm = "87141000";
    confianca = 0.86;
    justificativaRGI = "RGI 1 — parte/acessório de patinete elétrico (87.14.10).";
  } else if (/sechskantschrauben|parafuso sextavado|parafuso.*m8/.test(desc)) {
    posicao4 = "7318";
    ncm = "73181500";
    confianca = 0.88;
    justificativaRGI = "Nota 2 Seção XVII — parafuso de uso geral (73.18).";
  } else if (/handtuch|toalha.*microfibra|microfibra/.test(desc)) {
    posicao4 = "6302";
    ncm = listarNcm8DaPosicao(catalog, posicao4)[0]?.ncm ?? "";
    confianca = 0.72;
    justificativaRGI = "RGI 1 — artigos de toucador de têxteis (63.02).";
  } else if (/t-shirt|camiseta.*algod|baumwolle|herren/.test(desc)) {
    posicao4 = "6109";
    ncm = listarNcm8DaPosicao(catalog, posicao4).find((o) => o.folha.match(/algod|malha/i))?.ncm
      ?? listarNcm8DaPosicao(catalog, posicao4)[0]?.ncm
      ?? "";
    confianca = 0.74;
    justificativaRGI = "RGI 1 — camisetas de malha de algodão (61.09).";
  } else if (/ladegerat|ladegerät|carregador usb|schnellladegerat/.test(desc)) {
    posicao4 = "8504";
    ncm = "85044010";
    confianca = 0.88;
    justificativaRGI = "Nota 2 Seção XVII — carregador/adaptador elétrico (85.04.40).";
  } else if (/burostuhl|bürostuhl|cadeira de escritorio|cadeira de escritório/.test(desc)) {
    posicao4 = "9401";
    ncm = "94013900";
    confianca = 0.84;
    justificativaRGI = "RGI 1 + RGI 6 — assento giratório estofado de altura ajustável (9401.39).";
  } else if (/lustre|lumin[aá]ria|chandelier|wall lamp|pendente|ceiling light/i.test(it.descOriginal)) {
    posicao4 = "9405";
    ncm = "94052100";
    justificativaRGI = "RGI 1 — luminária elétrica de teto/parede.";
  } else {
    const detInput = { descOriginal: descPt, uso: it.uso };
    const cands = montarCandidatosPasse1(catalog, descPt, undefined, 25, detInput);
    if (!cands.length) return saidaPendente(it.descOriginal, descPt);
    posicao4 = cands[0]!.posicao4;
    const opcoes = listarNcm8DaPosicao(catalog, posicao4);
    if (!opcoes.length) return saidaPendente(it.descOriginal, descPt);
    ncm = opcoes[0]!.ncm;
    confianca = 0.65;
    justificativaRGI = "RGI 6 — candidato Siscomex por busca em PT (mock).";
  }

  if (!ncm || !catalog.existe(ncm)) {
    return saidaPendente(it.descOriginal, descPt);
  }

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
