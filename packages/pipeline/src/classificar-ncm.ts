/**
 * Pré-classificação e validação de NCM — reduz erros graves antes/depois da IA.
 * Complementa resolveNcm: família de produto, capítulo coerente, candidatos Siscomex.
 */

import type { NcmCandidato } from "@cia/shared";
import type { NcmCatalog } from "./ncm-catalog.js";
import { normNcm8 } from "./ncm-catalog.js";
import { aplicarDesempateOutros } from "./desempate-outros.js";

export interface FamiliaProduto {
  id: string;
  capitulo: string;
  /** Detecta família na descrição (PT/EN/ZH). */
  re: RegExp;
  /** Termos extras para busca na tabela Siscomex. */
  termosBusca: string;
  /** NCMs vigentes preferidos quando a busca empatar (ordem de preferência). */
  ncmPreferidos?: string[];
}

/** Famílias frequentes em importação China → capítulo NCM. Expandir conforme operação. */
export const FAMILIAS_PRODUTO: FamiliaProduto[] = [
  {
    id: "iluminacao",
    capitulo: "9405",
    re: /lustre|lumin[aá]ria|chandelier|pendente|plafon|wall\s*lamp|aisle\s*light|ceiling\s*light|light\s*fixture|吊灯|灯|照明|candelabro|arandela|spot\s*light/i,
    termosBusca: "lustre luminaria eletrica teto parede suspenso LED",
    ncmPreferidos: ["94052100", "94051190", "94051900", "94052900"],
  },
  {
    id: "audio_fones",
    capitulo: "8518",
    re: /fone|headphone|headset|earphone|earbud|tws|auscultador|auricular|耳机|耳塞/i,
    termosBusca: "fones ouvido auscultador headset earphone microfone bluetooth",
    ncmPreferidos: ["85183000"],
  },
  {
    id: "recipientes_isotermicos",
    capitulo: "9617",
    re: /garrafa\s*t[eé]rm|termic|thermal\s*flask|termo|isot[eé]rm|vacuum\s*flask|vacuum\s*bottle|保温杯|保温瓶/i,
    termosBusca: "garrafa termica recipiente isotermico vacuo isolamento",
    ncmPreferidos: ["96170010"],
  },
  {
    id: "moveis_assentos",
    capitulo: "9401",
    re: /cadeira|chair|assento|seat|escritorio|office|girator|swivel|rotativ|座椅/i,
    termosBusca: "assento cadeira giratoria escritorio altura ajustavel",
    ncmPreferidos: ["94013100", "94013900", "94014100"],
  },
  {
    id: "plasticos_chapas",
    capitulo: "3920",
    re: /pl[aá]stico|polietileno|pvc|acrylic|acrilico|薄膜|塑料/i,
    termosBusca: "placas folhas plastico polietileno",
  },
  {
    id: "maquinas_eletricas",
    capitulo: "8504",
    re: /transformador|fonte|power\s*supply|conversor|inversor|变压器/i,
    termosBusca: "transformador conversor estatico fonte alimentacao",
  },
  {
    id: "moto_eletrica",
    capitulo: "8711",
    re: /moto\s*el[eé]tr|motocicleta|electric\s*motorcycle|motorcycle|ciclomotor|摩托车/i,
    termosBusca: "motocicleta eletrica motorcycle ciclomotor",
    ncmPreferidos: ["87116000", "87119000"],
  },
  {
    id: "patinete_eletrico",
    capitulo: "9503",
    re: /patinete|kick\s*scooter|e-?scooter|scooter\s*el[eé]tr|hoverboard|电动滑板|滑板车/i,
    termosBusca: "patinete scooter eletrico brinquedo",
    ncmPreferidos: ["95030099", "95030031"],
  },
];

export function detectarFamilia(descricao: string): FamiliaProduto | null {
  const d = descricao.trim();
  if (!d) return null;
  for (const f of FAMILIAS_PRODUTO) {
    if (f.re.test(d)) return f;
  }
  return null;
}

/** Capítulo NCM (4 dígitos) coerente com a família detectada. */
export function ncmCoerenteComFamilia(ncm: string, familia: FamiliaProduto | null): boolean {
  if (!familia) return true;
  const key = normNcm8(ncm);
  return key != null && key.startsWith(familia.capitulo);
}

/** Expande descrição para busca Siscomex (sinônimos + família). */
export function enriquecerTextoClassificacao(descricao: string, familia: FamiliaProduto | null): string {
  const partes = [descricao.trim()];
  if (familia) partes.push(familia.termosBusca);
  return partes.filter(Boolean).join(" ");
}

/** Candidatos Siscomex por busca textual + preferência por família. */
export function candidatosSiscomexPorDescricao(
  catalog: NcmCatalog,
  descricao: string,
  familia: FamiliaProduto | null,
  limite = 5,
): NcmCandidato[] {
  const texto = enriquecerTextoClassificacao(descricao, familia);
  const cap = familia?.capitulo ?? descricao.replace(/\D/g, "").slice(0, 4);
  const cap4 = cap && cap.length === 4 && /^\d{4}$/.test(cap) ? cap : familia?.capitulo;
  const hits = catalog.buscarPorTexto(texto, cap4, limite + 5);
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

/** Filtra candidatos da IA que violam capítulo da família ou NCM inválido. */
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
}

/** Validação pós-resolução — sinaliza erro grave para UI/revisão. */
export function validarNcmItem(
  ncm: string,
  descricao: string,
  catalog: NcmCatalog,
  fonte: string,
): ValidacaoNcmItem {
  const avisos: string[] = [];
  const familia = detectarFamilia(descricao);
  const key = normNcm8(ncm);

  if (!key || !catalog.existe(key)) {
    avisos.push("NCM pendente ou inválido na tabela Siscomex — revisão obrigatória.");
    return { ok: false, avisos, familia };
  }

  if (familia && !ncmCoerenteComFamilia(key, familia)) {
    avisos.push(
      `NCM ${key} incoerente com o produto (${familia.id}, cap. ${familia.capitulo}) — possível erro de classificação.`,
    );
    return { ok: false, avisos, familia };
  }

  if (fonte === "ia" && familia) {
    avisos.push(`Classificado via IA — confira capítulo ${familia.capitulo} (Siscomex).`);
  }

  return { ok: true, avisos, familia };
}
