/**
 * Pré-classificação e validação de NCM — guard-rails de família + candidatos Siscomex.
 * Família não decide NCM-8 (decisor: fluxo 2 passes da API).
 */

import type { NcmCandidato } from "@cia/shared";
import type { NcmCatalog } from "./ncm-catalog.js";
import { normNcm8 } from "./ncm-catalog.js";
import { aplicarDesempateOutros } from "./desempate-outros.js";
import {
  detectarFamilia,
  detectarFamilias,
  FAMILIAS_PRODUTO,
  ncmCoerenteComFamilia,
  prefixoBuscaPrincipal,
  type FamiliaProduto,
} from "./familias/index.js";

export type { FamiliaProduto } from "./familias/index.js";
export {
  FAMILIAS_PRODUTO,
  detectarFamilia,
  detectarFamilias,
  avisoConflitoFamilias,
  ncmCoerenteComFamilia,
  ncmCoerenteComPrefixo,
  prefixosDasFamilias,
  prefixoBuscaPrincipal,
  type FamiliaDetectada,
  type ResultadoDeteccaoFamilias,
} from "./familias/index.js";

/** Expande descrição para busca Siscomex (sinônimos + família). */
export function enriquecerTextoClassificacao(descricao: string, familia: FamiliaProduto | null): string {
  const partes = [descricao.trim()];
  if (familia) partes.push(familia.termosBusca);
  return partes.filter(Boolean).join(" ");
}

/** Texto enriquecido para IA (2 passes) — material/uso quando presentes na planilha. */
export function textoClassificacaoIa(input: {
  descOriginal: string;
  material?: string | null;
  uso?: string | null;
}): string {
  const partes = [input.descOriginal.trim()];
  if (input.material?.trim()) partes.push(`Material: ${input.material.trim()}`);
  if (input.uso?.trim()) partes.push(`Uso: ${input.uso.trim()}`);
  return partes.filter(Boolean).join(" · ");
}

/** Candidatos Siscomex por busca textual + preferência por família (fallback). */
export function candidatosSiscomexPorDescricao(
  catalog: NcmCatalog,
  descricao: string,
  familia: FamiliaProduto | null,
  limite = 5,
): NcmCandidato[] {
  const texto = enriquecerTextoClassificacao(descricao, familia);
  const cap4 = prefixoBuscaPrincipal(familia) ?? descricao.replace(/\D/g, "").slice(0, 4);
  const capBusca = cap4 && /^\d{2,4}$/.test(cap4) ? cap4 : undefined;
  const hits = catalog.buscarPorTexto(texto, capBusca, limite + 5);
  const hitsOrdenados = aplicarDesempateOutros(catalog, hits);

  const preferidos = new Set(familia?.ncmPreferidos ?? []);
  const ordenados = [...hitsOrdenados].sort((a, b) => {
    const pa = preferidos.has(a.ncm) ? 1 : 0;
    const pb = preferidos.has(b.ncm) ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return b.score - a.score;
  });

  return ordenados.slice(0, limite).map((h, i) => ({
    ncm: h.ncm,
    descricaoOficial: h.descricao,
    confianca: Math.max(0.5, 0.92 - i * 0.08),
  }));
}

/** Filtra candidatos da IA que violam prefixos da família ou NCM inválido. */
export function filtrarCandidatosIaCoerentes(
  catalog: NcmCatalog,
  candidatos: NcmCandidato[],
  familia: FamiliaProduto | null,
): NcmCandidato[] {
  return candidatos.filter((c) => {
    const key = normNcm8(c.ncm);
    if (!key || !catalog.existe(key)) return false;
    return ncmCoerenteComFamilia(key, familia);
  });
}

export interface ValidacaoNcmItem {
  ok: boolean;
  avisos: string[];
  familia: FamiliaProduto | null;
  familiasDetectadas: FamiliaProduto[];
  conflitoFamilias: boolean;
}

/** Validação pós-resolução — sinaliza erro grave para UI/revisão. */
export function validarNcmItem(
  ncm: string,
  descricao: string,
  catalog: NcmCatalog,
  fonte: string,
): ValidacaoNcmItem {
  const avisos: string[] = [];
  const deteccao = detectarFamilias(descricao);
  const familia = deteccao.conflito ? null : deteccao.familias[0]?.familia ?? null;
  const familiasDetectadas = deteccao.familias.map((f) => f.familia);
  const key = normNcm8(ncm);

  if (deteccao.avisoConflito) avisos.push(deteccao.avisoConflito);

  if (!key || !catalog.existe(key)) {
    avisos.push("NCM pendente ou inválido na tabela Siscomex — revisão obrigatória.");
    return { ok: false, avisos, familia, familiasDetectadas, conflitoFamilias: deteccao.conflito };
  }

  if (familia && !ncmCoerenteComFamilia(key, familia)) {
    avisos.push(
      `NCM ${key} incoerente com o produto (${familia.id}, prefixos ${familia.prefixos.join("/")}) — possível erro de classificação.`,
    );
    return { ok: false, avisos, familia, familiasDetectadas, conflitoFamilias: deteccao.conflito };
  }

  if (fonte === "ia" && familia) {
    avisos.push(`Classificado via IA — confira prefixos ${familia.prefixos.join("/")} (Siscomex).`);
  }

  return { ok: true, avisos, familia, familiasDetectadas, conflitoFamilias: deteccao.conflito };
}
