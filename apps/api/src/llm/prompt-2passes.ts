/** Prompts e parsers — classificação NCM em 2 passes. */

import type { Ncm8Posicao, PosicaoCandidata } from "@cia/pipeline";
import { RGI_RESUMO } from "./ncm-regras.js";

/** Identificador auditável — exibir na prova LLM para confirmar versão do prompt. */
export const PROMPT_PASSE2_VERSION = "PROMPT_PASSE2_V2";

/** Produtos de referência para prova manual com LLM real (3 itens). */
export const PRODUTOS_PROVA_CLASSIFICACAO = [
  "Garrafa térmica inox 500ml isolamento vácuo",
  "Fone bluetooth TWS wireless earphone",
  "Cadeira de escritório giratória de altura ajustável, estofada, base metálica",
] as const;

export const SYSTEM_PASSE1 = [
  "Você é especialista em classificação fiscal NCM/SH (importação Brasil / Siscomex).",
  "PASSE 1: escolha a POSIÇÃO NCM de 4 dígitos mais adequada ao produto.",
  RGI_RESUMO,
  "Responda APENAS JSON válido.",
].join("\n\n");

export const SYSTEM_PASSE2 = [
  "Você é especialista em classificação fiscal NCM/SH (importação Brasil / Siscomex).",
  "PASSE 2: escolha o NCM-8 EXATO dentro da posição já selecionada.",
  "ORDEM DA NOMENCLATURA (obrigatório): avalie as subposições NA ORDEM em que aparecem na " +
    "lista ncm8Opcoes (sistemática do SH — do mais específico/ anterior ao residual). " +
    "Subposições residuais (ex.: «Outros assentos», «Outros») SÓ se aplicam ao que NÃO coube " +
    "nas subposições anteriores. Ex.: em 9401, assentos giratórios de altura ajustável (9401.31/39) " +
    "precedem «outros assentos» (9401.61/69) e assentos de metal (9401.71/79).",
  "Use a descrição COMPLETA hierárquica de cada código. Prefira o mais específico (RGI 3a).",
  "A justificativaRGI DEVE citar por que as subposições ANTERIORES à escolhida não se aplicam " +
    "(ex.: «9401.71 não se aplica porque o produto é giratório de altura ajustável, enquadrando-se em 9401.39»).",
  "Pese o MATERIAL informado na descrição (madeira, metal, plástico, estofado, etc.) quando for " +
    "determinante para a subposição.",
  "Quando o material for determinante e NÃO estiver informado, inclua avisoMaterial: " +
    '"material não informado — classificação assume X".',
  "Quando outro ATRIBUTO determinante para a subposição não estiver informado (ex.: «altura ajustável» " +
    "para 9401.3x, «giratório» vs assento fixo), escolha o código mais provável E inclua avisoAtributo: " +
    '"atributo determinante não informado: X — confirme para validar a subposição".',
  "NUNCA invente código — escolha SOMENTE entre os NCM-8 listados.",
  RGI_RESUMO,
  "Responda APENAS JSON válido.",
].join("\n\n");

export interface Passe1ItemInput {
  i: number;
  descricao: string;
  ncmInformado?: string | null;
  contexto?: string | null;
  candidatos: PosicaoCandidata[];
}

export interface Passe2ItemInput {
  i: number;
  descricao: string;
  posicao4: string;
  ncmInformado?: string | null;
  opcoes: Ncm8Posicao[];
}

export function buildPasse1Prompt(itens: Passe1ItemInput[]): string {
  const lista = itens.map((it) => ({
    i: it.i,
    descricao: it.descricao,
    ncmInformado: it.ncmInformado ?? null,
    contextoSiscomex: it.contexto ?? null,
    posicoesCandidatas: it.candidatos.map((c) => ({
      posicao4: c.posicao4,
      titulo: c.titulo,
      capitulo2: c.capitulo2,
    })),
  }));
  return (
    `Itens para PASSE 1 (escolher posicao4 ENTRE posicoesCandidatas):\n${JSON.stringify(lista, null, 0)}\n\n` +
    `Responda: {"itens":[{"i":0,"posicao4":"0000","confianca":0.0,"justificativaRGI":"..."}]}`
  );
}

export function buildPasse2Prompt(itens: Passe2ItemInput[]): string {
  const lista = itens.map((it) => ({
    i: it.i,
    descricao: it.descricao,
    posicao4: it.posicao4,
    ncmInformado: it.ncmInformado ?? null,
    ncm8Opcoes: [...it.opcoes]
      .sort((a, b) => a.ncm.localeCompare(b.ncm))
      .map((o) => ({ ncm: o.ncm, folha: o.folha, completa: o.completa.slice(0, 280) })),
  }));
  return (
    `Itens para PASSE 2 (escolher ncm ENTRE ncm8Opcoes — listadas em ORDEM da nomenclatura SH):\n` +
    `${JSON.stringify(lista, null, 0)}\n\n` +
    `Responda: {"itens":[{"i":0,"ncm":"00000000","confianca":0.0,"justificativaRGI":"...","descPt":"...","descDuimp":"...","avisoMaterial":null,"avisoAtributo":null}]}`
  );
}

export interface Passe1Parsed {
  posicao4: string;
  confianca: number;
  justificativaRGI: string;
}

export interface Passe2Parsed {
  ncm: string;
  confianca: number;
  justificativaRGI: string;
  descPt: string;
  descDuimp: string;
  avisoMaterial?: string;
  avisoAtributo?: string;
}

function parseJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  try {
    return JSON.parse(limpo);
  } catch {
    const m = limpo.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("Resposta da IA não é JSON válido.");
    return JSON.parse(m[0]);
  }
}

export function parsePasse1Response(texto: string, qtd: number): Passe1Parsed[] {
  const obj = parseJson(texto) as { itens?: unknown[] };
  const out: Passe1Parsed[] = [];
  for (let i = 0; i < qtd; i++) {
    const r = (obj.itens?.[i] ?? {}) as Record<string, unknown>;
    out.push({
      posicao4: String(r.posicao4 ?? "").replace(/\D/g, "").slice(0, 4),
      confianca: Math.max(0, Math.min(1, Number(r.confianca ?? 0))),
      justificativaRGI: String(r.justificativaRGI ?? ""),
    });
  }
  return out;
}

export function parsePasse2Response(texto: string, qtd: number): Passe2Parsed[] {
  const obj = parseJson(texto) as { itens?: unknown[] };
  const out: Passe2Parsed[] = [];
  for (let i = 0; i < qtd; i++) {
    const r = (obj.itens?.[i] ?? {}) as Record<string, unknown>;
    out.push({
      ncm: String(r.ncm ?? "").replace(/\D/g, "").slice(0, 8),
      confianca: Math.max(0, Math.min(1, Number(r.confianca ?? 0))),
      justificativaRGI: String(r.justificativaRGI ?? ""),
      descPt: String(r.descPt ?? ""),
      descDuimp: String(r.descDuimp ?? ""),
      avisoMaterial: r.avisoMaterial != null && String(r.avisoMaterial).trim()
        ? String(r.avisoMaterial).trim()
        : undefined,
      avisoAtributo: r.avisoAtributo != null && String(r.avisoAtributo).trim()
        ? String(r.avisoAtributo).trim()
        : undefined,
    });
  }
  return out;
}
