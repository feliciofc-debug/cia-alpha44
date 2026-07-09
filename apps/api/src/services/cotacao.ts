/** Orquestração da cotação: montar itens (parser→IA→TEC) e calcular (engine+benchmark+risco). */

import { calcCotacao, type CotacaoFiscalInput } from "@cia/fiscal-engine";
import { validarConfirmacaoNcmItens, aplicarIcmsCotacao, ncmInformadoParaFechamento, type IcmsCotacaoMeta } from "@cia/shared";
import {
  analisarRisco,
  anexarMetaFobItem,
  aplicarPlanilhaChinaCotacao,
  calibrarFobKg,
  confiancaNcmFinal,
  criarNcmCatalog,
  detectarFamilia,
  loadNcmVigenteCache,
  lookupBenchmark,
  preencherFobKgPlanilha,
  resolveNcm,
  pesoLiqReal,
  textoClassificacaoIa,
  validarNcmItem,
  resolverNcmDeclaradoCliente,
  resolverNcmHerancaFamiliaFatura,
  classificarSiscomexUltimoRecurso,
  carregarItensPlanilhaChinaOperacional,
  normNcm8,
  resolverNcmClassificacaoPlanilhaChina,
  type LinhaCrua,
  type NcmCatalog,
  type PlanilhaClienteNcmHit,
  type PlanilhaChinaNcmHit,
  resolverDescPtFornecedor,
} from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";
import type { AppState } from "../state.js";
import type { ClassifyItemInput, ClassifyItemOutput } from "../llm/types.js";
import { mapComConcorrencia } from "../util/map-concorrencia.js";
import { traduzirDescricaoClassificacaoMock } from "../llm/traducao-classificacao-mock.js";
import {
  criarStatsClassificacaoCache,
  cacheClassificacaoToxico,
  deveIgnorarCacheSemNcmReal,
  lookupClassificacaoCacheDetalhe,
  outputConfirmacaoHumana,
  salvarClassificacaoCacheLlm,
  versoesClassificacaoCache,
  type ClassificacaoCacheStats,
} from "./classificacao-cache.js";
import {
  fobKgFinalItem,
  fobKgReferenciaItem,
  fobTotalPlanilhaItem,
  fobUsadoNoEngine,
  pesoEngineItem,
  pesoFobPlanilhaItem,
} from "./fob-kg-manual.js";
import { converterLinhasEurParaUsd } from "./conversao-moeda-ingest.js";
import { normalizarMoedaCodigo } from "@cia/shared";

const CLASSIFY_CONCORRENCIA = Math.min(
  6,
  Math.max(1, Number.parseInt(process.env.CLASSIFY_CONCURRENCY ?? "5", 10) || 5),
);
const CONFIANCA_MIN_VISAO_VETO_PLANILHA_CHINA = 0.75;

function outputFromPlanilhaClienteHit(
  input: ClassifyItemInput,
  hit: PlanilhaClienteNcmHit,
  catalog: NcmCatalog,
): ClassifyItemOutput {
  const descOficial = catalog.descricao(hit.ncm) ?? hit.ncm;
  const rotulo =
    hit.provedor === "planilha-cliente"
      ? "NCM declarado na planilha do cliente"
      : hit.provedor === "planilha-cliente-hs6"
        ? `NCM derivado do código aduaneiro chinês (HS6 ${hit.hs6 ?? hit.ncm.slice(0, 6)}) declarado na planilha do cliente`
      : "NCM herdado de linha da mesma família na fatura";
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(input.descOriginal, input.descPtConfirmado);
  return {
    descPt,
    descDuimp: `${descOficial} — ${rotulo}.`,
    ncmCandidatos: [
      {
        ncm: hit.ncm,
        descricaoOficial: descOficial,
        confianca: hit.confianca,
      },
    ],
    classificacaoProvedor: hit.provedor,
    ...(avisoTraducao ? { avisoTraducao } : {}),
  };
}

function hitPlanilhaChinaCoerente(hit: PlanilhaChinaNcmHit | null, catalog: NcmCatalog): hit is PlanilhaChinaNcmHit {
  // O resolver da planilha China já rejeita match sem token de produto, família incoerente,
  // NCM fora do histórico China e código ausente no catálogo. Se sobrou hit, ele é a
  // referência primária do Felicio; Siscomex só entra quando a planilha não retorna nada.
  return Boolean(hit && catalog.existe(hit.ncm));
}

function outputFromPlanilhaChinaHit(
  input: ClassifyItemInput,
  hit: PlanilhaChinaNcmHit,
  catalog: NcmCatalog,
): ClassifyItemOutput {
  const descOficial = catalog.descricao(hit.ncm) ?? hit.desc;
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(input.descOriginal, input.descPtConfirmado);
  return {
    descPt,
    descDuimp: `${descOficial} — NCM equivalente da planilha Importação China (score ${hit.score.toFixed(2)}).`,
    ncmCandidatos: [
      {
        ncm: hit.ncm,
        descricaoOficial: descOficial,
        confianca: Math.min(0.96, Math.max(0.7, hit.score)),
      },
    ],
    classificacaoProvedor: "planilha-china",
    ...(avisoTraducao ? { avisoTraducao } : {}),
  };
}

function posicaoNcm4(ncm: string | null | undefined): string | null {
  const key = normNcm8(ncm ?? "");
  return key ? key.slice(0, 4) : null;
}

function visaoContradizPlanilhaChina(hit: PlanilhaChinaNcmHit, outputVisao: ClassifyItemOutput): boolean {
  const ncmVisao = outputVisao.ncmCandidatos[0]?.ncm;
  const posChina = posicaoNcm4(hit.ncm);
  const posVisao = posicaoNcm4(ncmVisao);
  return Boolean(posChina && posVisao && posChina !== posVisao);
}

function outputPlanilhaChinaConfirmadaPorVisao(
  input: ClassifyItemInput,
  hit: PlanilhaChinaNcmHit,
  catalog: NcmCatalog,
  outputVisao: ClassifyItemOutput,
): ClassifyItemOutput {
  const base = outputFromPlanilhaChinaHit(input, hit, catalog);
  const posChina = posicaoNcm4(hit.ncm);
  const ncmVisao = outputVisao.ncmCandidatos[0]?.ncm;
  const confirmacao = `Visão confirmou a família ${posChina ?? hit.ncm} da planilha China${ncmVisao ? ` (sugestão visual ${ncmVisao})` : ""}.`;
  return {
    ...base,
    justificativaRGI: [confirmacao, outputVisao.justificativaRGI].filter(Boolean).join(" "),
  };
}

function outputVisaoVetaPlanilhaChina(
  input: ClassifyItemInput,
  hit: PlanilhaChinaNcmHit,
  catalog: NcmCatalog,
  outputVisao: ClassifyItemOutput,
): ClassifyItemOutput {
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(input.descOriginal, outputVisao.descPt);
  const ncmVisao = normNcm8(outputVisao.ncmCandidatos[0]?.ncm ?? "");
  const descVisao = ncmVisao ? catalog.descricao(ncmVisao) ?? outputVisao.ncmCandidatos[0]?.descricaoOficial : null;
  const aviso = `Visão prevaleceu — conferir: vetou NCM da planilha China ${hit.ncm} (${hit.desc}) por família incompatível; aplicar ${ncmVisao ?? "sugestão visual"} e revisar manualmente.`;
  return {
    ...outputVisao,
    descPt,
    descDuimp: `${descVisao ?? outputVisao.descDuimp} — ${aviso}`,
    classificacaoProvedor: "gemini",
    classificacaoBaixaConfianca: true,
    justificativaRGI: [aviso, outputVisao.justificativaRGI].filter(Boolean).join(" "),
    ...(avisoTraducao ? { avisoTraducao } : {}),
  };
}

function normalizarDescPtClassificacao(
  descOriginal: string,
  output: ClassifyItemOutput,
): ClassifyItemOutput {
  const { descPt, avisoTraducao } = resolverDescPtFornecedor(descOriginal, output.descPt);
  return {
    ...output,
    descPt,
    avisoTraducao: avisoTraducao ?? output.avisoTraducao,
  };
}

function fonteClassificacaoDeProvedor(
  provedor: ClassifyItemOutput["classificacaoProvedor"],
): ResolveNcmInput["fonteClassificacao"] {
  if (
    provedor === "planilha-cliente" ||
    provedor === "planilha-cliente-hs6" ||
    provedor === "planilha-cliente-familia" ||
    provedor === "planilha-china" ||
    provedor === "siscomex" ||
    provedor === "gemini"
  ) {
    return provedor;
  }
  return undefined;
}

type ResolveNcmInput = Parameters<typeof resolveNcm>[1];

async function classificarItemComFallback(
  state: AppState,
  input: ClassifyItemInput,
  classificarItens2Passes: (
    provider: AppState["provider"],
    catalog: AppState["ncmCatalog"],
    itens: ClassifyItemInput[],
  ) => Promise<ClassifyItemOutput[] | null>,
): Promise<ClassifyItemOutput> {
  const doisPasses = await classificarItens2Passes(state.provider, state.ncmCatalog, [input]);
  if (doisPasses?.[0]) return doisPasses[0];
  const legado = await state.provider.classify([input]);
  return (
    legado[0] ?? {
      descPt: input.descOriginal,
      descDuimp: input.descOriginal,
      ncmCandidatos: [],
    }
  );
}

/** Classifica em paralelo — humano → tradução → planilha China → cache → Gemini/visão → Siscomex. */
async function classificarEmLotes(
  state: AppState,
  linhas: LinhaCrua[],
  opts?: { gravarCache?: boolean; ignorarCacheQuandoSemNcmReal?: boolean },
): Promise<{ classificados: ClassifyItemOutput[]; cache: ClassificacaoCacheStats }> {
  const { contextoSiscomexParaItem } = await import("../llm/ncm-contexto-siscomex.js");
  const { classificarItens2Passes, executar2PassesComLlm, traduzirDescricoesClassificacao } =
    await import("../llm/classificar-ncm-2passes.js");
  const { geminiClassificacaoHabilitada, geminiVisaoHabilitada, classificarItensGeminiLote } =
    await import("../llm/classificar-gemini-lovable.js");

  const inputs: ClassifyItemInput[] = linhas.map((l) => {
    const ext = l as LinhaCrua & {
      ncmRevisadoHumano?: boolean;
      ncmConfirmado?: string | null;
      descPt?: string | null;
      descDuimp?: string | null;
    };
    return {
      descOriginal: l.descOriginal,
      ncmInformado: l.ncm,
      material: l.material,
      uso: l.uso,
      contexto: contextoSiscomexParaItem(state.ncmCatalog, l.descOriginal, l.ncm),
      fotoBase64: l.fotoBase64,
      fotoMime: l.fotoMime,
      ncmRevisadoHumano: ext.ncmRevisadoHumano,
      ncmConfirmado: ext.ncmConfirmado,
      descPtConfirmado: ext.descPt,
      descDuimpConfirmado: ext.descDuimp,
    };
  });

  const versoes = versoesClassificacaoCache(state.ncmCatalog);
  const stats = criarStatsClassificacaoCache(inputs.length);
  stats.trace = [];
  const resultados: ClassifyItemOutput[] = new Array(inputs.length);
  const indicesLlm: number[] = [];
  const indicesValidacaoChinaVisao: number[] = [];
  const hitsChinaValidacaoVisao = new Map<number, PlanilhaChinaNcmHit>();
  const gravarCache = opts?.gravarCache !== false;
  const validarPlanilhaChinaComVisao = geminiClassificacaoHabilitada() && geminiVisaoHabilitada();
  const chamarLlm = state.provider.chamarLlm;
  const traducoes =
    chamarLlm && state.provider.disponivel
      ? await traduzirDescricoesClassificacao(inputs, chamarLlm)
      : {
          descricoes: inputs.map(
            (input) =>
              resolverDescPtFornecedor(
                input.descOriginal,
                traduzirDescricaoClassificacaoMock(input.descOriginal),
              ).descPt,
          ),
          traducaoIndisponivel: !state.provider.disponivel,
        };
  for (let i = 0; i < inputs.length; i++) {
    const descPt = inputs[i]!.descPtConfirmado?.trim() || traducoes.descricoes[i]!;
    inputs[i] = {
      ...inputs[i]!,
      descPtConfirmado: descPt,
      contexto: contextoSiscomexParaItem(state.ncmCatalog, descPt, inputs[i]!.ncmInformado),
    };
  }
  const planilhaChinaItens = carregarItensPlanilhaChinaOperacional();
  const salvarCache = async (
    input: Pick<ClassifyItemInput, "descOriginal" | "material" | "uso">,
    output: ClassifyItemOutput,
  ) => {
    if (!gravarCache) return;
    await salvarClassificacaoCacheLlm(
      { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
      versoes,
      output,
    );
  };

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
    const linha = linhas[i]!;
    const traceBase = {
      idx: i,
      descOriginal: input.descOriginal,
      linhaNcm: linha.ncm ?? null,
      inputNcmInformado: input.ncmInformado ?? null,
      ignorarCacheQuandoSemNcmReal: opts?.ignorarCacheQuandoSemNcmReal,
    };
    if (input.ncmRevisadoHumano && input.ncmConfirmado?.trim()) {
      resultados[i] = outputConfirmacaoHumana({
        descOriginal: input.descOriginal,
        material: input.material,
        uso: input.uso,
        ncmConfirmado: input.ncmConfirmado,
        descPt: input.descPtConfirmado ?? undefined,
        descDuimp: input.descDuimpConfirmado ?? undefined,
      });
      stats.humanos += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          decisao: "humano-confirmado",
          provedor: "humano",
          ncm: input.ncmConfirmado,
        });
      }
      continue;
    }

    const hitCliente = resolverNcmDeclaradoCliente(input, linha, state.ncmCatalog);
    if (hitCliente) {
      resultados[i] = outputFromPlanilhaClienteHit(input, hitCliente, state.ncmCatalog);
      await salvarCache(input, resultados[i]!);
      stats.hits += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          decisao: "planilha-cliente-direta",
          provedor: hitCliente.provedor,
          ncm: hitCliente.ncm,
        });
      }
      continue;
    }

    const hitFamilia = resolverNcmHerancaFamiliaFatura(
      linha,
      linhas,
      state.ncmCatalog,
      i,
    );
    if (hitFamilia) {
      resultados[i] = outputFromPlanilhaClienteHit(input, hitFamilia, state.ncmCatalog);
      await salvarCache(input, resultados[i]!);
      stats.hits += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          decisao: "planilha-cliente-familia",
          provedor: hitFamilia.provedor,
          ncm: hitFamilia.ncm,
        });
      }
      continue;
    }

    // HUMANO SOBERANO: NCM confirmado por humano (cache) vem antes da planilha China/visão.
    const cachedHumanoSoberano = await lookupClassificacaoCacheDetalhe(
      { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
      versoes,
    );
    if (cachedHumanoSoberano?.confirmadoHumano) {
      resultados[i] = {
        ...cachedHumanoSoberano.output,
        classificacaoCacheOrigem: "humano",
      };
      stats.hits += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          decisao: "cache-humano-soberano",
          provedor: "humano",
          ncm: cachedHumanoSoberano.output.ncmCandidatos?.[0]?.ncm ?? null,
        });
      }
      continue;
    }

    const hitChina = resolverNcmClassificacaoPlanilhaChina(
      {
        descOriginal: input.descPtConfirmado ?? input.descOriginal,
        ncm: null,
        material: input.material,
        uso: input.uso,
      },
      planilhaChinaItens,
      state.benchmarkIndex,
      state.ncmCatalog,
    );
    if (hitPlanilhaChinaCoerente(hitChina, state.ncmCatalog)) {
      if (validarPlanilhaChinaComVisao && input.fotoBase64) {
        indicesValidacaoChinaVisao.push(i);
        hitsChinaValidacaoVisao.set(i, hitChina);
        continue;
      }
      resultados[i] = outputFromPlanilhaChinaHit(input, hitChina, state.ncmCatalog);
      stats.hits += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          decisao: "planilha-china",
          provedor: "planilha-china",
          ncm: hitChina.ncm,
        });
      }
      continue;
    }

    const temColunaNcmReal = Boolean(normNcm8(linha.ncm ?? ""));
    const devePularCache = deveIgnorarCacheSemNcmReal({
      ignorarCacheQuandoSemNcmReal: opts?.ignorarCacheQuandoSemNcmReal,
      temColunaNcmReal,
    });
    const cached = devePularCache
      ? null
      : await lookupClassificacaoCacheDetalhe(
          { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
          versoes,
        );
    const cacheProvedor = cached
      ? String((cached.output as unknown as Record<string, unknown>).classificacaoProvedor ?? "")
      : null;
    const cacheToxico = cached ? cacheClassificacaoToxico(cached.output, { temColunaNcmReal }) : false;
    if (cached && !cacheToxico) {
      resultados[i] = {
        ...cached.output,
        classificacaoCacheOrigem: cached.confirmadoHumano ? "humano" : "llm",
      };
      stats.hits += 1;
      if (i === 0) {
        stats.trace?.push({
          ...traceBase,
          temColunaNcmReal,
          devePularCache,
          cacheLookupConsultado: !devePularCache,
          cacheEncontrado: true,
          cacheProvedor,
          cacheToxico,
          decisao: "cache",
          provedor: cacheProvedor,
          ncm: cached.output.ncmCandidatos?.[0]?.ncm ?? null,
        });
      }
      continue;
    }

    stats.misses += 1;
    if (i === 0) {
      stats.trace?.push({
        ...traceBase,
        temColunaNcmReal,
        devePularCache,
        cacheLookupConsultado: !devePularCache,
        cacheEncontrado: Boolean(cached),
        cacheProvedor,
        cacheToxico,
        decisao: "miss-gemini-siscomex",
      });
    }
    indicesLlm.push(i);
  }

  if (indicesValidacaoChinaVisao.length) {
    const inputsValidacao = indicesValidacaoChinaVisao.map((idx) => {
      const hit = hitsChinaValidacaoVisao.get(idx)!;
      return {
        ...inputs[idx]!,
        ncmInformado: hit.ncm,
        confiancaMinVisaoDivergente: CONFIANCA_MIN_VISAO_VETO_PLANILHA_CHINA,
      };
    });
    const visaoOut = await classificarItensGeminiLote(inputsValidacao, state.ncmCatalog, CLASSIFY_CONCORRENCIA);

    for (let j = 0; j < indicesValidacaoChinaVisao.length; j++) {
      const idxOrig = indicesValidacaoChinaVisao[j]!;
      const input = inputs[idxOrig]!;
      const hit = hitsChinaValidacaoVisao.get(idxOrig)!;
      const visao = visaoOut[j]!;
      if (visao.ok && visaoContradizPlanilhaChina(hit, visao.output)) {
        resultados[idxOrig] = outputVisaoVetaPlanilhaChina(input, hit, state.ncmCatalog, visao.output);
        stats.misses += 1;
        if (idxOrig === 0) {
          stats.trace?.push({
            idx: idxOrig,
            descOriginal: input.descOriginal,
            linhaNcm: linhas[idxOrig]?.ncm ?? null,
            inputNcmInformado: input.ncmInformado ?? null,
            ignorarCacheQuandoSemNcmReal: opts?.ignorarCacheQuandoSemNcmReal,
            decisao: "visao-vetou-planilha-china",
            provedor: `gemini-vetou-planilha-china-${hit.ncm}`,
            ncm: visao.output.ncmCandidatos[0]?.ncm ?? null,
          });
        }
        continue;
      }

      resultados[idxOrig] = visao.ok
        ? outputPlanilhaChinaConfirmadaPorVisao(input, hit, state.ncmCatalog, visao.output)
        : {
            ...outputFromPlanilhaChinaHit(input, hit, state.ncmCatalog),
            classificacaoBaixaConfianca: true,
            justificativaRGI: `Visão não conseguiu validar a planilha China (${visao.output.avisoTraducao ?? "sem sugestão visual"}); mantido NCM ${hit.ncm} para revisão.`,
          };
      stats.hits += 1;
      if (idxOrig === 0) {
        stats.trace?.push({
          idx: idxOrig,
          descOriginal: input.descOriginal,
          linhaNcm: linhas[idxOrig]?.ncm ?? null,
          inputNcmInformado: input.ncmInformado ?? null,
          ignorarCacheQuandoSemNcmReal: opts?.ignorarCacheQuandoSemNcmReal,
          decisao: visao.ok ? "planilha-china-confirmada-visao" : "planilha-china-visao-indisponivel",
          provedor: visao.ok
            ? `planilha-china-confirmada-visao-${visao.output.ncmCandidatos[0]?.ncm ?? "sem-ncm"}`
            : "planilha-china-visao-indisponivel",
          ncm: hit.ncm,
        });
      }
    }
  }

  if (indicesLlm.length === 0) {
    return { classificados: resultados, cache: stats };
  }

  let indicesFallback = indicesLlm;

  if (geminiClassificacaoHabilitada()) {
    const inputsGemini = indicesLlm.map((i) => inputs[i]!);
    const geminiOut = await classificarItensGeminiLote(
      inputsGemini,
      state.ncmCatalog,
      CLASSIFY_CONCORRENCIA,
    );

    indicesFallback = [];
    for (let j = 0; j < indicesLlm.length; j++) {
      const idxOrig = indicesLlm[j]!;
      const g = geminiOut[j]!;
      if (g.ok) {
        resultados[idxOrig] = g.output;
        await salvarCache(inputs[idxOrig]!, g.output);
      } else {
        indicesFallback.push(idxOrig);
      }
    }
  }

  if (indicesFallback.length === 0) {
    return { classificados: resultados, cache: stats };
  }

  const inputsLlm = indicesFallback.map((i) => inputs[i]!);

  const llmOut = await mapComConcorrencia(inputsLlm, CLASSIFY_CONCORRENCIA, async (input, j) => {
    const idxOrig = indicesFallback[j]!;
    try {
      if (chamarLlm) {
        const pre = {
          descricoes: [input.descPtConfirmado ?? traducoes.descricoes[idxOrig]!],
          traducaoIndisponivel: traducoes.traducaoIndisponivel,
        };
        const [doisPasses] = await executar2PassesComLlm(state.ncmCatalog, [input], chamarLlm, pre);
        if (doisPasses) {
          await salvarCache(input, doisPasses);
          return doisPasses;
        }
      }
      const fallback = await classificarItemComFallback(state, input, classificarItens2Passes);
      if (fallback.ncmCandidatos?.length) {
        await salvarCache(input, fallback);
      }
      return fallback;
    } catch {
      const fallback = await classificarItemComFallback(state, input, classificarItens2Passes);
      if (fallback.ncmCandidatos?.length) {
        await salvarCache(input, fallback);
      }
      return fallback;
    }
  });

  for (let j = 0; j < indicesFallback.length; j++) {
    resultados[indicesFallback[j]!] = llmOut[j]!;
  }

  for (let i = 0; i < resultados.length; i++) {
    const out = resultados[i];
    if (out) {
      resultados[i] = normalizarDescPtClassificacao(inputs[i]!.descOriginal, out);
    }
  }

  for (let i = 0; i < resultados.length; i++) {
    if (resultados[i]?.ncmCandidatos?.length) continue;
    const linhaPt = {
      ...linhas[i]!,
      descOriginal: inputs[i]!.descPtConfirmado ?? linhas[i]!.descOriginal,
    };
    const fb = classificarSiscomexUltimoRecurso(linhaPt, state.ncmCatalog);
    if (fb) {
      resultados[i] = fb;
      await salvarCache(inputs[i]!, fb);
    }
  }

  return { classificados: resultados, cache: stats };
}

export interface MontarItensOpts {
  moedaPlanilha?: string | null;
  cambioEurUsd?: number | null;
  cambioEurUsdData?: string | null;
  cambioEurUsdFonte?: string | null;
  gravarCacheClassificacao?: boolean;
  ignorarCacheClassificacaoSemNcmReal?: boolean;
}

export interface MontarItensMetaCambio {
  cambioEurUsd?: number | null;
  cambioEurUsdData?: string | null;
  cambioEurUsdFonte?: string | null;
}

/** Converte linhas EUR→US$ antes do benchmark quando ainda não convertidas na ingestão. */
async function prepararLinhasMoeda(
  linhas: LinhaCrua[],
  opts?: MontarItensOpts,
): Promise<{ linhas: LinhaCrua[]; meta: MontarItensMetaCambio }> {
  const meta: MontarItensMetaCambio = {
    cambioEurUsd: opts?.cambioEurUsd ?? null,
    cambioEurUsdData: opts?.cambioEurUsdData ?? null,
    cambioEurUsdFonte: opts?.cambioEurUsdFonte ?? null,
  };

  if (normalizarMoedaCodigo(opts?.moedaPlanilha) !== "EUR") {
    return { linhas, meta };
  }

  if (meta.cambioEurUsd != null && meta.cambioEurUsd > 0) {
    return { linhas, meta };
  }

  const convertido = await converterLinhasEurParaUsd({
    linhas,
    avisos: [] as string[],
    moedaPlanilha: opts?.moedaPlanilha ?? undefined,
    cambioEurUsd: opts?.cambioEurUsd ?? null,
    cambioEurUsdData: opts?.cambioEurUsdData ?? null,
    cambioEurUsdFonte: opts?.cambioEurUsdFonte ?? null,
  });

  return {
    linhas: convertido.linhas,
    meta: {
      cambioEurUsd: convertido.cambioEurUsd ?? null,
      cambioEurUsdData: convertido.cambioEurUsdData ?? null,
      cambioEurUsdFonte: convertido.cambioEurUsdFonte ?? null,
    },
  };
}

/** Converte linhas cruas do parser em itens de domínio (tradução+NCM via IA, alíquotas via TEC). */
export async function montarItens(
  linhas: LinhaCrua[],
  state: AppState,
  opts?: MontarItensOpts,
): Promise<{
  itens: Item[];
  provider: string;
  classificacaoCache: ClassificacaoCacheStats;
  cambioEurUsd?: number | null;
  cambioEurUsdData?: string | null;
  cambioEurUsdFonte?: string | null;
}> {
  const { linhas: linhasMoeda, meta: metaCambio } = await prepararLinhasMoeda(linhas, opts);
  const { linhas: linhasNorm, metas: metasFob } = preencherFobKgPlanilha(linhasMoeda, state.benchmarkIndex);
  const { classificados, cache: classificacaoCache } = await classificarEmLotes(state, linhasNorm, {
    gravarCache: opts?.gravarCacheClassificacao !== false,
    ignorarCacheQuandoSemNcmReal: opts?.ignorarCacheClassificacaoSemNcmReal === true,
  });

  const itens: Item[] = [];
  for (let i = 0; i < linhasNorm.length; i++) {
    const l = linhasNorm[i]!;
    const c = classificados[i];
    const candidatosBrutos = c?.ncmCandidatos ?? [];
    const resolvido = resolveNcm(state.ncmCatalog, {
      ncmPlanilha: l.ncm,
      candidatosIa: candidatosBrutos,
      fonteClassificacao: fonteClassificacaoDeProvedor(c?.classificacaoProvedor),
      descOriginal: l.descOriginal,
      descPt: c?.descPt,
      uso: l.uso,
      descricao: textoClassificacaoIa({
        descOriginal: l.descOriginal,
        descPt: c?.descPt,
        material: l.material,
        uso: l.uso,
      }),
    });
    const validacao = validarNcmItem(
      resolvido.ncm,
      l.descOriginal,
      state.ncmCatalog,
      resolvido.fonte,
      l.uso,
    );
    const ncm = resolvido.ncm;
    const tec =
      ncm && resolvido.valido
        ? await (state.tecSource.buscarAsync?.(ncm) ??
            Promise.resolve(state.tecSource.buscar(ncm)))
        : null;
    const pesoLiq = pesoLiqReal(l);
    const fobTotal = l.fobTotalUS ?? 0;
    const familia = detectarFamilia({ descOriginal: l.descOriginal, uso: l.uso ?? undefined });
    const ncmColuna = l.ncm ? normNcm8(l.ncm) : null;
    const ncmPlanilhaCliente =
      c?.classificacaoProvedor === "planilha-cliente" ||
      c?.classificacaoProvedor === "planilha-cliente-hs6" ||
      c?.classificacaoProvedor === "planilha-cliente-familia"
        ? normNcm8(c.ncmCandidatos?.[0]?.ncm ?? "")
        : null;
    const ncmEmbarqueStatus: "coluna" | "heranca-familia" | "sem-ncm-coluna" = ncmColuna
      ? "coluna"
      : c?.classificacaoProvedor === "planilha-cliente-familia" && ncmPlanilhaCliente
        ? "heranca-familia"
        : "sem-ncm-coluna";
    const ncmEmbarque =
      ncmEmbarqueStatus === "coluna"
        ? ncmColuna
        : ncmEmbarqueStatus === "heranca-familia"
          ? ncmPlanilhaCliente
          : null;

    const avisosClassificacao: string[] = [];
    if (c?.classificacaoBaixaConfianca) {
      avisosClassificacao.push("Classificação com baixa confiança — revisar");
    }
    if (c?.justificativaRGI) {
      avisosClassificacao.push(`RGI: ${c.justificativaRGI.slice(0, 200)}`);
    }
    if (c?.avisoMaterial) {
      avisosClassificacao.push(c.avisoMaterial);
    }
    if (c?.avisoAtributo) {
      avisosClassificacao.push(c.avisoAtributo);
    }
    if (c?.avisoTraducao) {
      avisosClassificacao.push(c.avisoTraducao);
    }
    const descPtResolvido = resolverDescPtFornecedor(l.descOriginal, c?.descPt);

    itens.push(
      anexarMetaFobItem(
        {
          descOriginal: l.descOriginal,
          descPt: descPtResolvido.descPt,
          descDuimp: c?.descDuimp ?? "",
          uso: l.uso ?? undefined,
          material: l.material ?? undefined,
          ncm,
          ncmConfianca:
            confiancaNcmFinal(ncm, candidatosBrutos, c?.confiancaPasse2) ?? undefined,
          ncmCandidatos: resolvido.ncmCandidatos,
          ncmValido: ncmInformadoParaFechamento({ ncm } as Item),
          ncmFonte: resolvido.fonte,
          ...(c?.classificacaoCacheOrigem
            ? { ncmClassificacaoCache: c.classificacaoCacheOrigem }
            : {}),
          ncmDescricaoOficial: resolvido.descricaoOficial ?? undefined,
          ncmPlanilhaOriginal: resolvido.ncmPlanilhaOriginal ?? undefined,
          ncmEmbarqueStatus,
          ...(ncmEmbarque != null ? { ncmEmbarque } : { ncmEmbarque: null }),
          ncmAvisos: [
            ...resolvido.avisos,
            ...validacao.avisos,
            ...avisosClassificacao,
            ...(descPtResolvido.avisoTraducao ? [descPtResolvido.avisoTraducao] : []),
          ].length
            ? [
                ...resolvido.avisos,
                ...validacao.avisos,
                ...avisosClassificacao,
                ...(descPtResolvido.avisoTraducao ? [descPtResolvido.avisoTraducao] : []),
              ]
            : undefined,
          ...(familia ? { familiaProdutoId: familia.id } : {}),
          pesoBrutoKg: l.pesoBrutoKg,
          pesoLiqKg: pesoLiq,
          qtd: l.qtd,
          fobUnitarioUS: l.fobUnitarioUS,
          fobTotalUS: fobTotal,
          ...(fobTotal > 0 ? { fobEmbarqueUS: fobTotal } : {}),
          aliquotas: tec?.aliquotas ?? { ii: 0, ipi: 0, pis: 0.021, cofins: 0.0965, icmsEntrada: 0 },
          aliquotasRastro: tec?.rastros,
          aliquotasOverride: false,
          anuencia: [],
          antidumping: false,
          ...(l.fotoBase64
            ? { fotoBase64: l.fotoBase64, fotoMime: l.fotoMime ?? "image/jpeg" }
            : {}),
        },
        metasFob[i] ?? { fobKgFonte: "linha" },
      ),
    );
  }

  const { avaliarCompatibilidadeLote } = await import("../siscomex/compatibilidade-produto.js");
  const { resolverJuizCompatibilidade } = await import("../llm/juiz-compatibilidade.js");
  const juiz = resolverJuizCompatibilidade(state.provider);
  const comps = await avaliarCompatibilidadeLote(
    state.ncmCatalog,
    itens.map((it, i) => ({
      descricao: it.descOriginal,
      descricaoFamilia: linhasNorm[i]!.descOriginal,
      material: linhasNorm[i]!.material ?? undefined,
      ncm: it.ncm,
      familiaId: it.familiaProdutoId,
    })),
    juiz,
  );
  for (let i = 0; i < itens.length; i++) {
    const c = comps[i]!;
    itens[i]!.compatibilidadeProduto = c.compatibilidadeProduto;
    itens[i]!.motivoCompatibilidade = c.motivoCompatibilidade;
  }

  return {
    itens,
    provider: state.provider.nome,
    classificacaoCache,
    cambioEurUsd: metaCambio.cambioEurUsd,
    cambioEurUsdData: metaCambio.cambioEurUsdData,
    cambioEurUsdFonte: metaCambio.cambioEurUsdFonte,
  };
}

export interface ResultadoCompleto {
  resultado: ReturnType<typeof calcCotacao>;
  itens: Item[];
  icms: IcmsCotacaoMeta;
  /** params com icmsSaida/icmsEntrada efetivos para persistência. */
  params: Cotacao["params"];
}

function normalizarParamsIpiSaidaLegado(params: Cotacao["params"]): Cotacao["params"] {
  if (params.ipiAliqSaida !== 0) return params;
  const { ipiAliqSaida: _legacyDefault, ...semOverrideIpi } = params;
  // O frontend antigo mandava 0 como default, mas no motor 0 é override explícito
  // para crédito integral de IPI. Sem controle manual na UI, esse zero é legado.
  return semOverrideIpi;
}

/** Enriquece itens (benchmark/calibragem/risco) e roda o engine fiscal. */
export function calcularCotacao(cotacao: Cotacao, state: AppState): ResultadoCompleto {
  const cotacaoSemOverrideIpiLegado = {
    ...cotacao,
    params: normalizarParamsIpiSaidaLegado(cotacao.params),
  };
  const { params: paramsIcms, meta: icms } = aplicarIcmsCotacao(cotacaoSemOverrideIpiLegado);
  const paramsEngine = { ...paramsIcms };
  const cotacaoIcms = { ...cotacaoSemOverrideIpiLegado, params: paramsEngine };

  /** Metodologia empresa: FOB DI = item resolvido; itens comuns já vêm como planilha FOB/kg × peso bruto. */
  const itensComFob = aplicarPlanilhaChinaCotacao(cotacaoIcms.itens, state.benchmarkIndex);

  const itensEnriquecidos: Item[] = itensComFob.map((it) => {
    const pesoRateio = pesoEngineItem(it);
    const benchmark = lookupBenchmark(state.benchmarkIndex, it.ncm || "00000000");
    const fobKgPlanilha = fobKgReferenciaItem({ ...it, benchmark, fobPendente: it.fobPendente });
    const fobMetodologia = it.fobPendente
      ? 0
      : fobTotalPlanilhaItem({ ...it, benchmark }, benchmark);
    const embarque = it.fobEmbarqueUS;
    const pesoBrutoFob = pesoFobPlanilhaItem(it, benchmark);
    const fobKgOriginal =
      fobMetodologia > 0 && pesoBrutoFob > 0
        ? fobMetodologia / pesoBrutoFob
        : embarque != null && embarque > 0 && pesoRateio > 0
          ? embarque / pesoRateio
          : null;
    const calibracao = it.fobPendente
      ? {
          fobKgOriginal: null,
          fobKgCalibrado: 0,
          desvioBenchmarkPct: null,
          ajustado: false,
          justificativa: "FOB/kg pendente — informe valor na planilha ou aguarde referência válida.",
        }
      : calibrarFobKg({
          fobKgOriginal,
          benchmark,
          fobTotalUS: fobMetodologia,
          pesoLiqKg: pesoRateio,
          fobKgFonte: it.fobKgFonte,
        });
    const risco = analisarRisco({
      benchmark,
      calibracao,
      fobKgFinal: it.fobPendente
        ? null
        : (it.fobKgManual ?? fobKgPlanilha ?? fobKgOriginal ?? calibracao.fobKgCalibrado),
      anuencia: it.anuencia,
      antidumping: it.antidumping,
    });
    const flags = it.fobPendente ? [...(risco.flags ?? []), "FOB_PENDENTE"] : risco.flags;
    let fobKgFonteEfetiva = it.fobKgFonte;
    if (it.fobKgFonte !== "preco-custo") {
      if (benchmark.fonte === "Histórico próprio") {
        fobKgFonteEfetiva = benchmark.rastroFonte ?? "planilha-operacional";
      } else if (benchmark.fonte === "ComexStat") {
        fobKgFonteEfetiva = benchmark.rastroFonte ?? "comexstat";
      }
    }
    return {
      ...it,
      fobTotalUS: fobMetodologia > 0 ? fobMetodologia : it.fobTotalUS,
      ...(embarque != null && embarque > 0 ? { fobEmbarqueUS: embarque } : {}),
      benchmark,
      calibracao,
      fobKgFonte: fobKgFonteEfetiva,
      risco: it.fobPendente ? { ...risco, flags, score: Math.max(risco.score, 40) } : risco,
      fotoBase64: it.fotoBase64,
      fotoMime: it.fotoMime,
      fotoPath: it.fotoPath,
    };
  });

  const engineInput: CotacaoFiscalInput = {
    cambio: cotacaoIcms.cambio,
    freteTotalUS: cotacaoIcms.freteTotalUS,
    adicionaisVaUS: cotacaoIcms.adicionaisVaUS,
    reducaoBaseUS: cotacaoIcms.reducaoBaseUS,
    siscomex: cotacaoIcms.siscomex,
    antidumpingBRL: cotacaoIcms.antidumpingBRL,
    itens: itensEnriquecidos.map((it) => ({
      ref: it.ncm,
      ncm: it.ncm,
      fobUS: fobUsadoNoEngine(it, it.calibracao!),
      pesoLiqKg: pesoEngineItem(it),
      aliqII: it.aliquotas.ii,
      aliqIPI: it.aliquotas.ipi,
      aliqPIS: it.aliquotas.pis,
      aliqCOFINS: it.aliquotas.cofins,
      aliqICMSEntrada: it.aliquotas.icmsEntrada,
    })),
    despesas: cotacaoIcms.despesas.map((d) => ({
      nome: d.nome,
      valorBRL: d.valorBRL,
      entraBaseSaida: d.entraBaseSaida,
      entraBaseNota: d.entraBaseNota,
    })),
    outrasDespesasBaseBRL: cotacaoIcms.outrasDespesasBaseBRL,
    params: paramsEngine,
  };

  const resultado = calcCotacao(engineInput);
  return { resultado, itens: validarConfirmacaoNcmItens(itensEnriquecidos), icms, params: paramsEngine };
}

export { fobKgFinalItem, fobKgReferenciaItem, fobTotalPlanilhaItem, fobUsadoNoEngine, pesoEngineItem, pesoFobPlanilhaItem };
