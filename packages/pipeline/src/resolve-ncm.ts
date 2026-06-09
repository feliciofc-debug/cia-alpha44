/**
 * Resolução de NCM — Siscomex (Classif) é a única fonte de códigos vigentes.
 * Planilha/IA só prevalecem se o código existir na tabela oficial.
 */

import type { NcmCandidato } from "@cia/shared";
import type { NcmCatalog } from "./ncm-catalog.js";
import { normNcm8 } from "./ncm-catalog.js";

export type NcmFonte = "planilha" | "ia" | "siscomex" | "pendente";

export interface ResolveNcmInput {
  ncmPlanilha?: string | null;
  candidatosIa?: NcmCandidato[];
  /** Descrição do produto — usada para sugerir NCM vigente quando planilha/IA falham. */
  descricao?: string | null;
}

export interface ResolveNcmResult {
  ncm: string;
  fonte: NcmFonte;
  valido: boolean;
  descricaoOficial: string | null;
  avisos: string[];
  ncmCandidatos: NcmCandidato[];
  /** NCM informado na planilha quando foi substituído por código inválido/desatualizado. */
  ncmPlanilhaOriginal?: string | null;
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
      confianca: c.confianca ?? 0.5,
    });
  }
  return out.slice(0, 5);
}

function candidatosDeBusca(
  catalog: NcmCatalog,
  descricao: string,
  capitulo4?: string,
): NcmCandidato[] {
  return catalog.buscarPorTexto(descricao, capitulo4, 5).map((r, i) => ({
    ncm: r.ncm,
    descricaoOficial: r.descricao,
    confianca: Math.max(0.35, 0.85 - i * 0.12),
  }));
}

function escolherSubstituto(
  catalog: NcmCatalog,
  input: ResolveNcmInput,
  capitulo4?: string,
): { ncm: string; fonte: NcmFonte; candidatos: NcmCandidato[] } | null {
  const ia = filtrarCandidatosValidos(catalog, input.candidatosIa ?? []);
  if (ia[0]) return { ncm: ia[0].ncm, fonte: "ia", candidatos: ia };

  const desc = [input.descricao, ...(input.candidatosIa ?? []).map((c) => c.descricaoOficial)]
    .filter(Boolean)
    .join(" ");
  if (desc.trim()) {
    const busca = candidatosDeBusca(catalog, desc, capitulo4);
    if (busca[0]) return { ncm: busca[0].ncm, fonte: "siscomex", candidatos: busca };
  }

  if (capitulo4) {
    const cap = catalog.listarPorCapitulo(capitulo4).slice(0, 5);
    if (cap[0]) {
      const candidatos = cap.map((c, i) => ({
        ncm: c.ncm,
        descricaoOficial: c.descricao,
        confianca: 0.3 - i * 0.03,
      }));
      return { ncm: candidatos[0]!.ncm, fonte: "siscomex", candidatos };
    }
  }
  return null;
}

/** Escolhe NCM final — nunca retorna código ausente na tabela Siscomex vigente. */
export function resolveNcm(catalog: NcmCatalog, input: ResolveNcmInput): ResolveNcmResult {
  const avisos: string[] = [];
  const planilha = input.ncmPlanilha ? normNcm8(input.ncmPlanilha) : null;
  const candidatosValidos = filtrarCandidatosValidos(catalog, input.candidatosIa ?? []);

  const invalidosIa = (input.candidatosIa ?? []).filter((c) => {
    const k = normNcm8(c.ncm);
    return k && !catalog.existe(k);
  });
  if (invalidosIa.length) {
    const ex = normNcm8(invalidosIa[0]!.ncm);
    avisos.push(
      `IA sugeriu NCM inválido (${ex ?? "?"}) — rejeitado pela tabela Siscomex (${catalog.total} códigos vigentes).`,
    );
  }

  if (planilha && catalog.existe(planilha)) {
    const iaTop = candidatosValidos[0]?.ncm;
    if (iaTop && iaTop !== planilha) {
      avisos.push(`IA sugeriu ${iaTop} — mantido NCM da planilha (${planilha}), validado Siscomex.`);
    }
    return {
      ncm: planilha,
      fonte: "planilha",
      valido: true,
      descricaoOficial: catalog.descricao(planilha),
      avisos,
      ncmCandidatos: candidatosValidos.length ? candidatosValidos : candidatosDeBusca(catalog, input.descricao ?? "", planilha.slice(0, 4)),
    };
  }

  if (planilha) {
    avisos.push(
      `NCM ${planilha} da planilha NÃO existe na NCM vigente Siscomex — código desatualizado ou incorreto.`,
    );
    const sub = escolherSubstituto(catalog, input, planilha.slice(0, 4));
    if (sub) {
      avisos.push(
        sub.fonte === "ia"
          ? `Substituído por NCM válido sugerido pela IA: ${sub.ncm}.`
          : `Substituído por NCM vigente Siscomex (busca oficial): ${sub.ncm}.`,
      );
      return {
        ncm: sub.ncm,
        fonte: sub.fonte,
        valido: true,
        descricaoOficial: catalog.descricao(sub.ncm),
        avisos,
        ncmCandidatos: sub.candidatos,
        ncmPlanilhaOriginal: planilha,
      };
    }
    return {
      ncm: "",
      fonte: "pendente",
      valido: false,
      descricaoOficial: null,
      avisos: [...avisos, "Sem substituto automático — selecione NCM manualmente na tabela Siscomex."],
      ncmCandidatos: candidatosValidos,
      ncmPlanilhaOriginal: planilha,
    };
  }

  if (candidatosValidos[0]) {
    avisos.push("Planilha sem NCM — usando sugestão da IA validada na tabela Siscomex.");
    const escolhido = candidatosValidos[0];
    return {
      ncm: escolhido.ncm,
      fonte: "ia",
      valido: true,
      descricaoOficial: catalog.descricao(escolhido.ncm),
      avisos,
      ncmCandidatos: candidatosValidos,
    };
  }

  const sub = escolherSubstituto(catalog, input);
  if (sub) {
    avisos.push(`NCM inferido pela tabela Siscomex a partir da descrição: ${sub.ncm}.`);
    return {
      ncm: sub.ncm,
      fonte: "siscomex",
      valido: true,
      descricaoOficial: catalog.descricao(sub.ncm),
      avisos,
      ncmCandidatos: sub.candidatos,
    };
  }

  avisos.push("NCM não informado e sem correspondência na tabela Siscomex.");
  return {
    ncm: "",
    fonte: "pendente",
    valido: false,
    descricaoOficial: null,
    avisos,
    ncmCandidatos: [],
  };
}
