/** Prompts e parsers — classificação NCM em 2 passes. */

import type { Ncm8Posicao, PosicaoCandidata } from "@cia/pipeline";
import { RGI_RESUMO } from "./ncm-regras.js";

export const SYSTEM_PASSE1 = [
  "Você é especialista em classificação fiscal NCM/SH (importação Brasil / Siscomex).",
  "PASSE 1: escolha a POSIÇÃO NCM de 4 dígitos mais adequada ao produto.",
  RGI_RESUMO,
  "Responda APENAS JSON válido.",
].join("\n\n");

export const SYSTEM_PASSE2 = [
  "Você é especialista em classificação fiscal NCM/SH (importação Brasil / Siscomex).",
  "PASSE 2: escolha o NCM-8 EXATO dentro da posição já selecionada.",
  "Use a descrição COMPLETA hierárquica de cada código. Prefira o mais específico (RGI 3a).",
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
    ncm8Opcoes: it.opcoes.map((o) => ({ ncm: o.ncm, folha: o.folha, completa: o.completa.slice(0, 280) })),
  }));
  return (
    `Itens para PASSE 2 (escolher ncm ENTRE ncm8Opcoes):\n${JSON.stringify(lista, null, 0)}\n\n` +
    `Responda: {"itens":[{"i":0,"ncm":"00000000","confianca":0.0,"justificativaRGI":"...","descPt":"...","descDuimp":"..."}]}`
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
    });
  }
  return out;
}
