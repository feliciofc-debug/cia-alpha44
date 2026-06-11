/**
 * Compatibilidade semântica produto × NCM (T5).
 * (a) família/prefixo → (b) heurística termos → (c) LLM juiz se inconclusivo.
 * "incompativel" final exige (a)+(b) concordando ou (c) confirmando.
 */

import { detectarFamilia, ncmCoerenteComFamilia, normNcm8, type NcmCatalog } from "@cia/pipeline";
import type { LlmCallFn } from "../llm/classificar-ncm-2passes.js";
import {
  SYSTEM_JUIZ_COMPATIBILIDADE,
  buildUserPromptCompatibilidade,
  parseRespostaJuizCompatibilidade,
} from "../llm/prompt-compatibilidade.js";
import { gravarCacheCompatibilidade, lerCacheCompatibilidade } from "./cache-compatibilidade-llm.js";
import {
  OVERLAP_ALTO,
  avaliarHeuristicaTermos,
  type ResultadoHeuristica,
  type StatusHeuristica,
} from "./heuristica-termos.js";
import type { CompatibilidadeProduto } from "./types.js";

export interface ResultadoCompatibilidade {
  compatibilidadeProduto: CompatibilidadeProduto;
  motivoCompatibilidade: string;
  camada: "familia" | "heuristica" | "combinada" | "llm";
}

export interface EntradaCompatibilidade {
  descricao: string;
  ncm: string;
  /** Camada (a): família detectada na descrição original da planilha (evita conflito por descPt IA). */
  descricaoFamilia?: string;
}

type SinalFamilia = "ok" | "indicio_incompativel" | "neutro";

interface AvaliacaoFamilia {
  sinal: SinalFamilia;
  motivo: string;
  termosBusca?: string;
}

function avaliarCamadaFamilia(descricao: string, ncm: string): AvaliacaoFamilia {
  const familia = detectarFamilia(descricao);
  if (!familia) {
    return { sinal: "neutro", motivo: "Família não detectada ou conflito de famílias." };
  }
  const coerente = ncmCoerenteComFamilia(ncm, familia);
  if (coerente) {
    return {
      sinal: "ok",
      motivo: `Família "${familia.id}" coerente com prefixo NCM.`,
      termosBusca: familia.termosBusca,
    };
  }
  return {
    sinal: "indicio_incompativel",
    motivo: `Família "${familia.id}" (cap. ${familia.prefixos.join("/")}) incompatível com NCM ${normNcm8(ncm) ?? ncm}.`,
    termosBusca: familia.termosBusca,
  };
}

type DecisaoAB = CompatibilidadeProduto | "inconclusivo";

function combinarCamadasAB(familia: AvaliacaoFamilia, heuristica: ResultadoHeuristica): DecisaoAB {
  const { sinal } = familia;
  const b = heuristica.status;

  if (sinal === "ok") {
    if (b === "compativel") return "compativel";
    if (b === "incompativel") return "revisar";
    if (b === "revisar") return "revisar";
    return "inconclusivo";
  }

  if (sinal === "indicio_incompativel") {
    // Regra dura T5-E2E: camada (a) nunca vira "compativel" por heurística (b).
    if (b === "incompativel") return "incompativel";
    if (b === "revisar") return "revisar";
    if (b === "compativel") {
      return heuristica.score >= OVERLAP_ALTO ? "revisar" : "incompativel";
    }
    return "incompativel";
  }

  // neutro
  if (b === "compativel") return "compativel";
  if (b === "incompativel") return "inconclusivo";
  if (b === "revisar") return "inconclusivo";
  return "inconclusivo";
}

function motivoCombinado(familia: AvaliacaoFamilia, heuristica: ResultadoHeuristica, decisao: DecisaoAB): string {
  if (decisao === "incompativel") {
    return `${familia.motivo} ${heuristica.motivo}`.trim();
  }
  if (decisao === "compativel") {
    return heuristica.motivo || familia.motivo;
  }
  if (decisao === "revisar") {
    if (familia.sinal === "indicio_incompativel" && heuristica.score >= OVERLAP_ALTO) {
      return `Família sugere capítulo distinto, mas overlap alto com descrição NCM — ${heuristica.motivo}`;
    }
    return heuristica.motivo || familia.motivo;
  }
  return heuristica.motivo || familia.motivo;
}

export function avaliarCompatibilidadeProduto(
  catalog: NcmCatalog,
  entrada: EntradaCompatibilidade,
): { resultado: ResultadoCompatibilidade; precisaLlm: boolean } {
  const ncmKey = normNcm8(entrada.ncm) ?? entrada.ncm.replace(/\D/g, "").padStart(8, "0");
  const descricaoNcm = catalog.descricaoCompleta(ncmKey) ?? catalog.descricao(ncmKey) ?? "";

  const descFamilia = (entrada.descricaoFamilia ?? entrada.descricao).trim();
  const familia = avaliarCamadaFamilia(descFamilia, ncmKey);
  const heuristica = avaliarHeuristicaTermos(entrada.descricao, descricaoNcm, familia.termosBusca, ncmKey);
  const decisao = combinarCamadasAB(familia, heuristica);

  if (decisao !== "inconclusivo") {
    return {
      resultado: {
        compatibilidadeProduto: decisao,
        motivoCompatibilidade: motivoCombinado(familia, heuristica, decisao),
        camada: decisao === "incompativel" ? "combinada" : heuristica.status === "compativel" ? "heuristica" : "combinada",
      },
      precisaLlm: false,
    };
  }

  return {
    resultado: {
      compatibilidadeProduto: "revisar",
      motivoCompatibilidade: motivoCombinado(familia, heuristica, "revisar"),
      camada: "heuristica",
    },
    precisaLlm: true,
  };
}

async function juizLlm(
  chamarLlm: LlmCallFn,
  descricao: string,
  ncm: string,
  descricaoNcm: string,
): Promise<ResultadoCompatibilidade | null> {
  const cached = lerCacheCompatibilidade(ncm, descricao);
  if (cached) return cached;

  const user = buildUserPromptCompatibilidade({
    descricaoProduto: descricao,
    ncm,
    descricaoNcmCompleta: descricaoNcm,
  });
  const texto = await chamarLlm(SYSTEM_JUIZ_COMPATIBILIDADE, user);
  const parsed = parseRespostaJuizCompatibilidade(texto);
  if (!parsed) return null;

  const resultado: ResultadoCompatibilidade = {
    compatibilidadeProduto: parsed.status,
    motivoCompatibilidade: parsed.motivo,
    camada: "llm",
  };
  gravarCacheCompatibilidade(ncm, descricao, resultado);
  return resultado;
}

/** Avalia lote: (a)+(b) síncrono; (c) LLM só para inconclusivos (máx 1/item, cache). */
export async function avaliarCompatibilidadeLote(
  catalog: NcmCatalog,
  entradas: EntradaCompatibilidade[],
  chamarLlm?: LlmCallFn,
): Promise<ResultadoCompatibilidade[]> {
  const parciais = entradas.map((e) => avaliarCompatibilidadeProduto(catalog, e));
  const resultados = parciais.map((p) => p.resultado);

  if (!chamarLlm) return resultados;

  await Promise.all(
    parciais.map(async (p, i) => {
      if (!p.precisaLlm) return;
      const e = entradas[i]!;
      const ncmKey = normNcm8(e.ncm) ?? e.ncm.replace(/\D/g, "").padStart(8, "0");
      const descricaoNcm = catalog.descricaoCompleta(ncmKey) ?? catalog.descricao(ncmKey) ?? "";
      if (!descricaoNcm) return;
      const juiz = await juizLlm(chamarLlm, e.descricao, ncmKey, descricaoNcm);
      if (juiz) resultados[i] = juiz;
    }),
  );

  return resultados;
}

/** Exportado para testes unitários de combinação (a)+(b). */
export function combinarCamadasABParaTeste(
  familia: AvaliacaoFamilia,
  heuristica: { status: StatusHeuristica; score: number; motivo: string },
): DecisaoAB {
  return combinarCamadasAB(familia, heuristica as ResultadoHeuristica);
}

export { avaliarCamadaFamilia, avaliarHeuristicaTermos };
