/** Orquestração da cotação: montar itens (parser→IA→TEC) e calcular (engine+benchmark+risco). */

import { calcCotacao, type CotacaoFiscalInput } from "@cia/fiscal-engine";
import {
  analisarRisco,
  calibrarFobKg,
  lookupBenchmark,
  resolvePesoLiqLinha,
  type LinhaCrua,
} from "@cia/pipeline";
import type { Cotacao, Item } from "@cia/shared";
import type { AppState } from "../state.js";

const CLASSIFY_LOTE = 12;

/** Classifica em lotes para não estourar tokens/tempo da IA em planilhas grandes. */
async function classificarEmLotes(
  state: AppState,
  linhas: LinhaCrua[],
): Promise<Awaited<ReturnType<AppState["provider"]["classify"]>>> {
  const inputs = linhas.map((l) => ({ descOriginal: l.descOriginal, ncmInformado: l.ncm }));
  const saida: Awaited<ReturnType<AppState["provider"]["classify"]>> = [];
  for (let i = 0; i < inputs.length; i += CLASSIFY_LOTE) {
    const parte = await state.provider.classify(inputs.slice(i, i + CLASSIFY_LOTE));
    saida.push(...parte);
  }
  return saida;
}

/** Converte linhas cruas do parser em itens de domínio (tradução+NCM via IA, alíquotas via TEC). */
export async function montarItens(linhas: LinhaCrua[], state: AppState): Promise<{ itens: Item[]; provider: string }> {
  const classificados = await classificarEmLotes(state, linhas);

  const itens: Item[] = linhas.map((l, i) => {
    const c = classificados[i];
    const candidatos = c?.ncmCandidatos ?? [];
    const ncm = l.ncm ?? candidatos[0]?.ncm ?? "";
    const tec = ncm ? state.tecSource.buscar(ncm) : null;
    const pesoLiq = resolvePesoLiqLinha(l);
    const fobTotal = l.fobTotalUS ?? 0;

    return {
      descOriginal: l.descOriginal,
      descPt: c?.descPt ?? l.descOriginal,
      descDuimp: c?.descDuimp ?? "",
      ncm,
      ncmCandidatos: candidatos,
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
    };
  });

  return { itens, provider: state.provider.nome };
}

export interface ResultadoCompleto {
  resultado: ReturnType<typeof calcCotacao>;
  itens: Item[];
}

/** Enriquece itens (benchmark/calibragem/risco) e roda o engine fiscal. */
export function calcularCotacao(cotacao: Cotacao, state: AppState): ResultadoCompleto {
  const itensEnriquecidos: Item[] = cotacao.itens.map((it) => {
    const fobKg = it.pesoLiqKg > 0 ? it.fobTotalUS / it.pesoLiqKg : null;
    const benchmark = lookupBenchmark(state.benchmarkIndex, it.ncm || "00000000");
    const calibracao = calibrarFobKg({ fobKgOriginal: fobKg, benchmark });
    const risco = analisarRisco({
      benchmark,
      calibracao,
      fobKgFinal: fobKg ?? calibracao.fobKgCalibrado,
      anuencia: it.anuencia,
      antidumping: it.antidumping,
    });
    return { ...it, benchmark, calibracao, risco };
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
      fobUS: it.fobTotalUS,
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
