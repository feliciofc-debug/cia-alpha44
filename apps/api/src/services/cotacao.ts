/** Orquestração da cotação: montar itens (parser→IA→TEC) e calcular (engine+benchmark+risco). */

import { calcCotacao, type CotacaoFiscalInput } from "@cia/fiscal-engine";
import { validarConfirmacaoNcmItens, aplicarIcmsCotacao, type IcmsCotacaoMeta } from "@cia/shared";
import {
  analisarRisco,
  anexarMetaFobItem,
  aplicarRegrasFobItens,
  calibrarFobKg,
  confiancaNcmFinal,
  criarNcmCatalog,
  loadNcmVigenteCache,
  lookupBenchmark,
  preencherFobKgPlanilha,
  resolveNcm,
  resolvePesoLiqRateio,
  pesoLiqReal,
  textoClassificacaoIa,
  validarNcmItem,
  type LinhaCrua,
  type NcmCatalog,
} from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";
import type { AppState } from "../state.js";
import type { ClassifyItemInput, ClassifyItemOutput } from "../llm/types.js";
import { mapComConcorrencia } from "../util/map-concorrencia.js";
import {
  criarStatsClassificacaoCache,
  lookupClassificacaoCache,
  outputConfirmacaoHumana,
  salvarClassificacaoCacheLlm,
  versoesClassificacaoCache,
  type ClassificacaoCacheStats,
} from "./classificacao-cache.js";
import { converterLinhasEurParaUsd } from "./conversao-moeda-ingest.js";
import { normalizarMoedaCodigo } from "@cia/shared";

const CLASSIFY_CONCORRENCIA = Math.min(
  6,
  Math.max(1, Number.parseInt(process.env.CLASSIFY_CONCURRENCY ?? "5", 10) || 5),
);

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

/** Classifica em paralelo (2 passes por item) — cache P3b + tradução em lote + fallback legado. */
async function classificarEmLotes(
  state: AppState,
  linhas: LinhaCrua[],
): Promise<{ classificados: ClassifyItemOutput[]; cache: ClassificacaoCacheStats }> {
  const { contextoSiscomexParaItem } = await import("../llm/ncm-contexto-siscomex.js");
  const { classificarItens2Passes, executar2PassesComLlm, traduzirDescricoesClassificacao } =
    await import("../llm/classificar-ncm-2passes.js");

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
      ncmRevisadoHumano: ext.ncmRevisadoHumano,
      ncmConfirmado: ext.ncmConfirmado,
      descPtConfirmado: ext.descPt,
      descDuimpConfirmado: ext.descDuimp,
    };
  });

  const versoes = versoesClassificacaoCache(state.ncmCatalog);
  const stats = criarStatsClassificacaoCache(inputs.length);
  const resultados: ClassifyItemOutput[] = new Array(inputs.length);
  const indicesLlm: number[] = [];

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i]!;
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
      continue;
    }

    const cached = await lookupClassificacaoCache(
      { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
      versoes,
    );
    if (cached) {
      resultados[i] = cached;
      stats.hits += 1;
      continue;
    }

    stats.misses += 1;
    indicesLlm.push(i);
  }

  if (indicesLlm.length === 0) {
    return { classificados: resultados, cache: stats };
  }

  const chamarLlm = state.provider.chamarLlm;
  const inputsLlm = indicesLlm.map((i) => inputs[i]!);
  const batchTrad =
    chamarLlm && state.provider.disponivel
      ? await traduzirDescricoesClassificacao(inputsLlm, chamarLlm)
      : null;

  const llmOut = await mapComConcorrencia(inputsLlm, CLASSIFY_CONCORRENCIA, async (input, j) => {
    const idxOrig = indicesLlm[j]!;
    try {
      if (chamarLlm && batchTrad) {
        const pre = {
          descricoes: [batchTrad.descricoes[j]!],
          traducaoIndisponivel: batchTrad.traducaoIndisponivel,
        };
        const [doisPasses] = await executar2PassesComLlm(state.ncmCatalog, [input], chamarLlm, pre);
        if (doisPasses) {
          await salvarClassificacaoCacheLlm(
            { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
            versoes,
            doisPasses,
          );
          return doisPasses;
        }
      }
      const fallback = await classificarItemComFallback(state, input, classificarItens2Passes);
      if (fallback.ncmCandidatos?.length) {
        await salvarClassificacaoCacheLlm(
          { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
          versoes,
          fallback,
        );
      }
      return fallback;
    } catch {
      const fallback = await classificarItemComFallback(state, input, classificarItens2Passes);
      if (fallback.ncmCandidatos?.length) {
        await salvarClassificacaoCacheLlm(
          { descOriginal: input.descOriginal, material: input.material, uso: input.uso },
          versoes,
          fallback,
        );
      }
      return fallback;
    }
  });

  for (let j = 0; j < indicesLlm.length; j++) {
    resultados[indicesLlm[j]!] = llmOut[j]!;
  }

  return { classificados: resultados, cache: stats };
}

export interface MontarItensOpts {
  moedaPlanilha?: string | null;
  cambioEurUsd?: number | null;
  cambioEurUsdData?: string | null;
  cambioEurUsdFonte?: string | null;
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
  const { classificados, cache: classificacaoCache } = await classificarEmLotes(state, linhasNorm);

  const itens: Item[] = [];
  for (let i = 0; i < linhasNorm.length; i++) {
    const l = linhasNorm[i]!;
    const c = classificados[i];
    const candidatosBrutos = c?.ncmCandidatos ?? [];
    const resolvido = resolveNcm(state.ncmCatalog, {
      ncmPlanilha: l.ncm,
      candidatosIa: candidatosBrutos,
      descOriginal: l.descOriginal,
      uso: l.uso,
      descricao: textoClassificacaoIa({
        descOriginal: c?.descPt || l.descOriginal,
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

    itens.push(
      anexarMetaFobItem(
        {
          descOriginal: l.descOriginal,
          descPt: c?.descPt ?? l.descOriginal,
          descDuimp: c?.descDuimp ?? "",
          uso: l.uso ?? undefined,
          material: l.material ?? undefined,
          ncm,
          ncmConfianca:
            confiancaNcmFinal(ncm, candidatosBrutos, c?.confiancaPasse2) ?? undefined,
          ncmCandidatos: resolvido.ncmCandidatos,
          ncmValido: resolvido.valido && validacao.ok,
          ncmFonte: resolvido.fonte,
          ncmDescricaoOficial: resolvido.descricaoOficial ?? undefined,
          ncmPlanilhaOriginal: resolvido.ncmPlanilhaOriginal ?? undefined,
          ncmAvisos: [...resolvido.avisos, ...validacao.avisos, ...avisosClassificacao].length
            ? [...resolvido.avisos, ...validacao.avisos, ...avisosClassificacao]
            : undefined,
          pesoBrutoKg: l.pesoBrutoKg,
          pesoLiqKg: pesoLiq,
          qtd: l.qtd,
          fobUnitarioUS: l.fobUnitarioUS,
          fobTotalUS: fobTotal,
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

/** Enriquece itens (benchmark/calibragem/risco) e roda o engine fiscal. */
export function calcularCotacao(cotacao: Cotacao, state: AppState): ResultadoCompleto {
  const { params: paramsIcms, meta: icms } = aplicarIcmsCotacao(cotacao);
  const cotacaoIcms = { ...cotacao, params: paramsIcms };

  const itensComFob = aplicarRegrasFobItens(cotacaoIcms.itens, state.benchmarkIndex);

  const itensEnriquecidos: Item[] = itensComFob.map((it) => {
    const pesoRateio = pesoEngineItem(it);
    const fobKg = pesoRateio > 0 && it.fobTotalUS > 0 ? it.fobTotalUS / pesoRateio : null;
    const benchmark = lookupBenchmark(state.benchmarkIndex, it.ncm || "00000000");
    const calibracao = it.fobPendente
      ? {
          fobKgOriginal: null,
          fobKgCalibrado: 0,
          desvioBenchmarkPct: null,
          ajustado: false,
          justificativa: "FOB/kg pendente — informe valor na planilha ou aguarde referência válida.",
        }
      : calibrarFobKg({
          fobKgOriginal: fobKg,
          benchmark,
          fobTotalUS: it.fobTotalUS,
          pesoLiqKg: pesoRateio,
        });
    const risco = analisarRisco({
      benchmark,
      calibracao,
      fobKgFinal: it.fobPendente ? null : (fobKg ?? calibracao.fobKgCalibrado),
      anuencia: it.anuencia,
      antidumping: it.antidumping,
    });
    const flags = it.fobPendente ? [...(risco.flags ?? []), "FOB_PENDENTE"] : risco.flags;
    return {
      ...it,
      fobTotalUS: it.fobTotalUS,
      benchmark,
      calibracao,
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
    params: paramsIcms,
  };

  const resultado = calcCotacao(engineInput);
  return { resultado, itens: validarConfirmacaoNcmItens(itensEnriquecidos), icms, params: paramsIcms };
}

function pesoEngineItem(it: Item): number {
  return resolvePesoLiqRateio({ pesoLiqKg: it.pesoLiqKg, pesoBrutoKg: it.pesoBrutoKg });
}

function fobUsadoNoEngine(it: Item, calibracao: ReturnType<typeof calibrarFobKg>): number {
  if (it.fobPendente) return 0;
  const pesoRateio = pesoEngineItem(it);
  // FOB explícito na planilha prevalece — ComexStat só eleva se faltava preço ou calibragem defensiva (ajustado).
  if (it.fobTotalUS > 0 && calibracao.fobKgOriginal && calibracao.fobKgOriginal > 0 && !calibracao.ajustado) {
    return it.fobTotalUS;
  }
  if (calibracao.fobKgCalibrado > 0 && pesoRateio > 0) {
    return calibracao.fobKgCalibrado * pesoRateio;
  }
  return it.fobTotalUS;
}
