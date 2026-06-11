/** Orquestração da cotação: montar itens (parser→IA→TEC) e calcular (engine+benchmark+risco). */

import { calcCotacao, type CotacaoFiscalInput } from "@cia/fiscal-engine";
import {
  analisarRisco,
  anexarMetaFobItem,
  aplicarRegrasFobItens,
  calibrarFobKg,
  criarNcmCatalog,
  loadNcmVigenteCache,
  lookupBenchmark,
  preencherFobKgPlanilha,
  resolveNcm,
  resolvePesoLiqLinha,
  validarNcmItem,
  type LinhaCrua,
  type NcmCatalog,
} from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";
import type { AppState } from "../state.js";
import type { ClassifyItemInput, ClassifyItemOutput } from "../llm/types.js";
import { mapComConcorrencia } from "../util/map-concorrencia.js";

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

/** Classifica em paralelo (2 passes por item) — fallback legado por item em falha. */
async function classificarEmLotes(
  state: AppState,
  linhas: LinhaCrua[],
): Promise<ClassifyItemOutput[]> {
  const { contextoSiscomexParaItem } = await import("../llm/ncm-contexto-siscomex.js");
  const { classificarItens2Passes } = await import("../llm/classificar-ncm-2passes.js");

  const inputs: ClassifyItemInput[] = linhas.map((l) => ({
    descOriginal: l.descOriginal,
    ncmInformado: l.ncm,
    contexto: contextoSiscomexParaItem(state.ncmCatalog, l.descOriginal, l.ncm),
  }));

  return mapComConcorrencia(inputs, CLASSIFY_CONCORRENCIA, async (input) => {
    try {
      return await classificarItemComFallback(state, input, classificarItens2Passes);
    } catch {
      const [legado] = await state.provider.classify([input]);
      return (
        legado ?? {
          descPt: input.descOriginal,
          descDuimp: input.descOriginal,
          ncmCandidatos: [],
        }
      );
    }
  });
}

/** Converte linhas cruas do parser em itens de domínio (tradução+NCM via IA, alíquotas via TEC). */
export async function montarItens(linhas: LinhaCrua[], state: AppState): Promise<{ itens: Item[]; provider: string }> {
  const { linhas: linhasNorm, metas: metasFob } = preencherFobKgPlanilha(linhas, state.benchmarkIndex);
  const classificados = await classificarEmLotes(state, linhasNorm);

  const itens: Item[] = [];
  for (let i = 0; i < linhasNorm.length; i++) {
    const l = linhasNorm[i]!;
    const c = classificados[i];
    const candidatosBrutos = c?.ncmCandidatos ?? [];
    const resolvido = resolveNcm(state.ncmCatalog, {
      ncmPlanilha: l.ncm,
      candidatosIa: candidatosBrutos,
      descricao: c?.descPt || l.descOriginal,
    });
    const validacao = validarNcmItem(
      resolvido.ncm,
      c?.descPt || l.descOriginal,
      state.ncmCatalog,
      resolvido.fonte,
    );
    const ncm = resolvido.ncm;
    const tec =
      ncm && resolvido.valido
        ? await (state.tecSource.buscarAsync?.(ncm) ??
            Promise.resolve(state.tecSource.buscar(ncm)))
        : null;
    const pesoLiq = resolvePesoLiqLinha(l);
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

    itens.push(
      anexarMetaFobItem(
        {
          descOriginal: l.descOriginal,
          descPt: c?.descPt ?? l.descOriginal,
          descDuimp: c?.descDuimp ?? "",
          ncm,
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
    itens.map((it) => ({ descricao: it.descPt || it.descOriginal, ncm: it.ncm })),
    juiz,
  );
  for (let i = 0; i < itens.length; i++) {
    const c = comps[i]!;
    itens[i]!.compatibilidadeProduto = c.compatibilidadeProduto;
    itens[i]!.motivoCompatibilidade = c.motivoCompatibilidade;
  }

  return { itens, provider: state.provider.nome };
}

export interface ResultadoCompleto {
  resultado: ReturnType<typeof calcCotacao>;
  itens: Item[];
}

function fobUsadoNoEngine(it: Item, calibracao: ReturnType<typeof calibrarFobKg>): number {
  if (it.fobPendente) return 0;
  // FOB explícito na planilha prevalece — ComexStat só eleva se faltava preço ou calibragem defensiva (ajustado).
  if (it.fobTotalUS > 0 && calibracao.fobKgOriginal && calibracao.fobKgOriginal > 0 && !calibracao.ajustado) {
    return it.fobTotalUS;
  }
  if (calibracao.fobKgCalibrado > 0 && it.pesoLiqKg > 0) {
    return calibracao.fobKgCalibrado * it.pesoLiqKg;
  }
  return it.fobTotalUS;
}

/** Enriquece itens (benchmark/calibragem/risco) e roda o engine fiscal. */
export function calcularCotacao(cotacao: Cotacao, state: AppState): ResultadoCompleto {
  const itensComFob = aplicarRegrasFobItens(cotacao.itens, state.benchmarkIndex);

  const itensEnriquecidos: Item[] = itensComFob.map((it) => {
    const fobKg = it.pesoLiqKg > 0 && it.fobTotalUS > 0 ? it.fobTotalUS / it.pesoLiqKg : null;
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
          pesoLiqKg: it.pesoLiqKg,
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
    cambio: cotacao.cambio,
    freteTotalUS: cotacao.freteTotalUS,
    adicionaisVaUS: cotacao.adicionaisVaUS,
    reducaoBaseUS: cotacao.reducaoBaseUS,
    siscomex: cotacao.siscomex,
    antidumpingBRL: cotacao.antidumpingBRL,
    itens: itensEnriquecidos.map((it) => ({
      ref: it.ncm,
      ncm: it.ncm,
      fobUS: fobUsadoNoEngine(it, it.calibracao!),
      pesoLiqKg: it.pesoLiqKg,
      aliqII: it.aliquotas.ii,
      aliqIPI: it.aliquotas.ipi,
      aliqPIS: it.aliquotas.pis,
      aliqCOFINS: it.aliquotas.cofins,
      aliqICMSEntrada: it.aliquotas.icmsEntrada,
    })),
    despesas: cotacao.despesas.map((d) => ({
      nome: d.nome,
      valorBRL: d.valorBRL,
      entraBaseSaida: d.entraBaseSaida,
      entraBaseNota: d.entraBaseNota,
    })),
    outrasDespesasBaseBRL: cotacao.outrasDespesasBaseBRL,
    params: cotacao.params,
  };

  const resultado = calcCotacao(engineInput);
  return { resultado, itens: itensEnriquecidos };
}
