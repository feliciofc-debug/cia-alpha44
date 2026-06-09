/**
 * Resolução de NCM — planilha tem prioridade; IA só preenche lacunas;
 * candidatos inválidos na tabela Siscomex são descartados.
 */

import type { NcmCandidato } from "@cia/shared";
import type { NcmCatalog } from "./ncm-catalog.js";
import { normNcm8 } from "./ncm-catalog.js";

export type NcmFonte = "planilha" | "ia" | "pendente";

export interface ResolveNcmInput {
  ncmPlanilha?: string | null;
  candidatosIa?: NcmCandidato[];
}

export interface ResolveNcmResult {
  ncm: string;
  fonte: NcmFonte;
  valido: boolean;
  descricaoOficial: string | null;
  avisos: string[];
  ncmCandidatos: NcmCandidato[];
}

function filtrarCandidatosValidos(catalog: NcmCatalog, candidatos: NcmCandidato[]): NcmCandidato[] {
  const vistos = new Set<string>();
  const out: NcmCandidato[] = [];
  for (const c of candidatos) {
    const key = normNcm8(c.ncm);
    if (!key || vistos.has(key) || !catalog.existe(key)) continue;
    vistos.add(key);
    out.push({
      ...c,
      ncm: key,
      descricaoOficial: c.descricaoOficial ?? catalog.descricao(key) ?? undefined,
    });
  }
  return out.slice(0, 3);
}

function sugestoesCapitulo(catalog: NcmCatalog, ncmPlanilha: string): string[] {
  const cap = ncmPlanilha.slice(0, 4);
  const similares = catalog.listarPorCapitulo(cap).slice(0, 3);
  if (!similares.length) return [];
  return [
    `NCMs vigentes no capítulo ${cap}: ${similares.map((s) => `${s.ncm} (${s.descricao.slice(0, 40)}…)`).join("; ")}`,
  ];
}

/** Escolhe o NCM final e gera avisos de conferência. */
export function resolveNcm(catalog: NcmCatalog, input: ResolveNcmInput): ResolveNcmResult {
  const avisos: string[] = [];
  const planilha = input.ncmPlanilha ? normNcm8(input.ncmPlanilha) : null;
  const candidatosValidos = filtrarCandidatosValidos(catalog, input.candidatosIa ?? []);

  if (planilha) {
    const valido = catalog.existe(planilha);
    const descricaoOficial = catalog.descricao(planilha);

    if (!valido) {
      avisos.push(
        `NCM ${planilha} da planilha não consta na tabela NCM vigente Siscomex — conferir (pode ser código de processo anterior).`,
      );
      avisos.push(...sugestoesCapitulo(catalog, planilha));
    }

    const iaTop = candidatosValidos[0]?.ncm;
    if (iaTop && iaTop !== planilha) {
      avisos.push(`IA sugeriu ${iaTop} — mantido o NCM informado na planilha (${planilha}).`);
    }

    const invalidosIa = (input.candidatosIa ?? []).filter((c) => {
      const k = normNcm8(c.ncm);
      return k && !catalog.existe(k);
    });
    if (invalidosIa.length) {
      const ex = normNcm8(invalidosIa[0]!.ncm);
      avisos.push(
        `Descartado(s) ${invalidosIa.length} NCM(s) inválido(s) sugerido(s) pela IA (ex.: ${ex ?? "?"}).`,
      );
    }

    return {
      ncm: planilha,
      fonte: "planilha",
      valido,
      descricaoOficial,
      avisos,
      ncmCandidatos: candidatosValidos,
    };
  }

  if (candidatosValidos.length > 0) {
    const escolhido = candidatosValidos[0]!;
    avisos.push("Planilha sem NCM — usando sugestão da IA validada na tabela Siscomex.");
    return {
      ncm: escolhido.ncm,
      fonte: "ia",
      valido: true,
      descricaoOficial: catalog.descricao(escolhido.ncm),
      avisos,
      ncmCandidatos: candidatosValidos,
    };
  }

  const invalidosIa = (input.candidatosIa ?? [])
    .map((c) => normNcm8(c.ncm))
    .filter((k): k is string => k != null && !catalog.existe(k));
  if (invalidosIa.length) {
    avisos.push(`IA sugeriu NCM inválido (${invalidosIa[0]}) — rejeitado pela tabela Siscomex.`);
  }
  avisos.push("NCM não informado na planilha e sem sugestão IA válida.");

  return {
    ncm: "",
    fonte: "pendente",
    valido: false,
    descricaoOficial: null,
    avisos,
    ncmCandidatos: [],
  };
}
