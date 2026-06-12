/**
 * Resolução de NCM — Siscomex (Classif) é a única fonte de códigos vigentes.
 * Planilha/IA só prevalecem se o código existir na tabela oficial e for coerente com o produto.
 */

import type { NcmCandidato } from "@cia/shared";
import {
  candidatosSiscomexPorDescricao,
  detectarFamilias,
  enriquecerTextoClassificacao,
  filtrarCandidatosIaCoerentes,
  MIN_SCORE_BUSCA_NCM,
  ncmCoerenteComFamilia,
  prefixoBuscaPrincipal,
  type FamiliaProduto,
} from "./classificar-ncm.js";
import type { NcmCatalog } from "./ncm-catalog.js";
import { normNcm8 } from "./ncm-catalog.js";
import { aplicarDesempateOutros } from "./desempate-outros.js";

export type NcmFonte = "planilha" | "ia" | "siscomex" | "pendente";

export interface ResolveNcmInput {
  ncmPlanilha?: string | null;
  candidatosIa?: NcmCandidato[];
  /** Texto enriquecido para busca Siscomex (pode incluir material/uso). */
  descricao?: string | null;
  /** Descrição da planilha — única base para detecção de família (sem material). */
  descOriginal?: string | null;
  uso?: string | null;
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

/** Capítulos de uso geral (Nota 2 Seção XVII) — IA pode prevalecer fora do guard-rail da família. */
const CAPITULOS_USO_GERAL_IA = new Set(["73", "84", "85", "90", "91", "92", "93"]);

function iaIncoerenteAceitavel(ncm: string, familia: FamiliaProduto): boolean {
  const cap2 = ncm.slice(0, 2);
  if (!CAPITULOS_USO_GERAL_IA.has(cap2)) return false;
  return !familia.prefixos.some((p) => {
    const pre = p.replace(/\D/g, "");
    return pre.length >= 2 && ncm.startsWith(pre);
  });
}

const CONFIANCA_IA_MINIMA = 0.6;
const AVISO_CLASSIFICACAO_PENDENTE = "Classificação pendente — revisar";

function candidatosDeBusca(
  catalog: NcmCatalog,
  descricao: string,
  capitulo4?: string,
): NcmCandidato[] {
  const hits = aplicarDesempateOutros(catalog, catalog.buscarPorTexto(descricao, capitulo4, 5)).filter(
    (h) => h.score >= MIN_SCORE_BUSCA_NCM,
  );
  return hits.map((r, i) => ({
    ncm: r.ncm,
    descricaoOficial: r.descricao,
    confianca: Math.max(0.35, 0.85 - i * 0.12),
  }));
}

function prepararCandidatosIa(
  catalog: NcmCatalog,
  input: ResolveNcmInput,
  familia: FamiliaProduto | null,
  avisos: string[],
): NcmCandidato[] {
  const validos = filtrarCandidatosValidos(catalog, input.candidatosIa ?? []);
  if (!familia) return validos;

  const incoerentes = validos.filter((c) => !ncmCoerenteComFamilia(c.ncm, familia));
  if (incoerentes.length) {
    const planilha = input.ncmPlanilha ? normNcm8(input.ncmPlanilha) : null;
    const planilhaOk =
      planilha && catalog.existe(planilha) && (!familia || ncmCoerenteComFamilia(planilha, familia));
    if (planilhaOk) {
      avisos.push(
        `Candidato alternativo da IA (${incoerentes.map((c) => c.ncm).join(", ")}) descartado pelo guard-rail — mantido NCM da planilha (${planilha}).`,
      );
    } else {
      avisos.push(
        `IA sugeriu NCM fora dos prefixos ${familia.prefixos.join("/")} (${familia.id}) — candidato(s) rejeitado(s): ${incoerentes.map((c) => c.ncm).join(", ")}.`,
      );
    }
  }
  return filtrarCandidatosIaCoerentes(catalog, validos, familia);
}

function escolherSubstituto(
  catalog: NcmCatalog,
  input: ResolveNcmInput,
  familia: FamiliaProduto | null,
  capitulo4?: string,
  avisos?: string[],
): { ncm: string; fonte: NcmFonte; candidatos: NcmCandidato[] } | null {
  const cap = prefixoBuscaPrincipal(familia) ?? capitulo4;
  const validosRaw = filtrarCandidatosValidos(catalog, input.candidatosIa ?? []);
  const iaCoerentes = familia
    ? validosRaw.filter((c) => ncmCoerenteComFamilia(c.ncm, familia))
    : validosRaw;

  if (familia && validosRaw.length) {
    prepararCandidatosIa(catalog, input, familia, avisos ?? []);
  }

  const escolhaIaRaw =
    iaCoerentes[0] ??
    (familia && validosRaw[0] && iaIncoerenteAceitavel(validosRaw[0].ncm, familia) ? validosRaw[0] : null);
  const escolhaIa =
    escolhaIaRaw && (escolhaIaRaw.confianca ?? 0) >= CONFIANCA_IA_MINIMA ? escolhaIaRaw : null;

  if (escolhaIaRaw && !escolhaIa && avisos) {
    avisos.push(`${AVISO_CLASSIFICACAO_PENDENTE} (confiança IA ${(escolhaIaRaw.confianca ?? 0).toFixed(2)} < ${CONFIANCA_IA_MINIMA}).`);
  }

  if (escolhaIa) {
    const conf = escolhaIa.confianca ?? 0.5;
    if (conf < CONFIANCA_IA_MINIMA && avisos) {
      avisos.push("Classificação com baixa confiança — revisar");
    }
    if (familia && !ncmCoerenteComFamilia(escolhaIa.ncm, familia) && avisos) {
      avisos.push(
        `IA sugeriu NCM fora dos prefixos ${familia.prefixos.join("/")} (${familia.id}) — mantido candidato IA ${escolhaIa.ncm} (uso geral / Nota 2).`,
      );
    }
    return { ncm: escolhaIa.ncm, fonte: "ia", candidatos: validosRaw };
  }

  const desc = enriquecerTextoClassificacao(input.descricao ?? "", familia);
  const siscomex = familia
    ? candidatosSiscomexPorDescricao(catalog, input.descricao ?? "", familia)
    : candidatosDeBusca(catalog, desc, cap);

  if (siscomex[0]) return { ncm: siscomex[0].ncm, fonte: "siscomex", candidatos: siscomex };

  return null;
}

/** Escolhe NCM final — nunca retorna código ausente na tabela Siscomex vigente. */
export function resolveNcm(catalog: NcmCatalog, input: ResolveNcmInput): ResolveNcmResult {
  const avisos: string[] = [];
  const deteccao = detectarFamilias({
    descOriginal: input.descOriginal ?? input.descricao ?? "",
    uso: input.uso,
  });
  const familia = deteccao.conflito ? null : (deteccao.familias[0]?.familia ?? null);
  if (deteccao.avisoConflito) avisos.push(deteccao.avisoConflito);
  const planilha = input.ncmPlanilha ? normNcm8(input.ncmPlanilha) : null;
  const candidatosValidos = prepararCandidatosIa(catalog, input, familia, avisos);

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
    if (familia && !ncmCoerenteComFamilia(planilha, familia)) {
      avisos.push(
        `NCM da planilha (${planilha}) incoerente com ${familia.id} (prefixos ${familia.prefixos.join("/")}) — buscando substituto Siscomex.`,
      );
      const sub = escolherSubstituto(catalog, input, familia, planilha.slice(0, 4), avisos);
      if (sub) {
        avisos.push(`Substituído por ${sub.ncm} (${sub.fonte}).`);
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
    }
    const iaTop = candidatosValidos[0]?.ncm;
    if (iaTop && iaTop !== planilha) {
      avisos.push(
        `Candidato alternativo da IA (${iaTop}) descartado pelo guard-rail — mantido NCM da planilha (${planilha}).`,
      );
    }
    return {
      ncm: planilha,
      fonte: "planilha",
      valido: true,
      descricaoOficial: catalog.descricao(planilha),
      avisos,
      ncmCandidatos: candidatosValidos.length
        ? candidatosValidos
        : candidatosSiscomexPorDescricao(catalog, input.descricao ?? "", familia),
    };
  }

  if (planilha) {
    avisos.push(
      `NCM ${planilha} da planilha NÃO existe na NCM vigente Siscomex — código desatualizado ou incorreto.`,
    );
    const sub = escolherSubstituto(catalog, input, familia, planilha.slice(0, 4), avisos);
    if (sub) {
      avisos.push(
        sub.fonte === "ia"
          ? `Substituído por NCM válido sugerido pela IA: ${sub.ncm}.`
          : `Substituído por NCM vigente Siscomex (busca por família/descrição): ${sub.ncm}.`,
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
      avisos: [...avisos, AVISO_CLASSIFICACAO_PENDENTE, "Sem substituto automático — selecione NCM manualmente na tabela Siscomex."],
      ncmCandidatos: candidatosValidos,
      ncmPlanilhaOriginal: planilha,
    };
  }

  const sub = escolherSubstituto(catalog, input, familia, undefined, avisos);
  if (sub) {
    avisos.push(
      sub.fonte === "ia"
        ? `NCM sugerido pela IA (validado Siscomex): ${sub.ncm}.`
        : `NCM inferido pela tabela Siscomex (${familia?.id ?? "busca"}): ${sub.ncm}.`,
    );
    return {
      ncm: sub.ncm,
      fonte: sub.fonte,
      valido: true,
      descricaoOficial: catalog.descricao(sub.ncm),
      avisos,
      ncmCandidatos: sub.candidatos,
    };
  }

  avisos.push(AVISO_CLASSIFICACAO_PENDENTE);
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
