import type { Despesa } from "./types.ts";

/** Despesas por container — planilha 66 (Plan1 C24:C32). */
export const DESPESAS_POR_CONTAINER: Despesa[] = [
  { nome: "AFRMM", valorBRL: 4000, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Armazenagem", valorBRL: 6000, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Liberação BL", valorBRL: 2500, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Registro ANVISA/INMETRO", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Administrativo", valorBRL: 5000, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Transp+Esc DTA", valorBRL: 3500, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Transporte (destino)", valorBRL: 8000, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Escolta", valorBRL: 2500, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Despacho/Honorários", valorBRL: 4000, entraBaseSaida: true, entraBaseNota: true },
];

export const DESPESAS_PADRAO = DESPESAS_POR_CONTAINER;
const OUTRAS_DESPESAS_BASE_POR_CONTAINER = 14_040;

/** Defaults operacionais da planilha 66. */
export const DEFAULT_FRETE_US = 3500;
export const DEFAULT_SISCOMEX_BRL = 154.23;

export function despesasParaContainers(qtdContainers: number): Despesa[] {
  const qtd = Math.max(1, Math.round(qtdContainers));
  return DESPESAS_POR_CONTAINER.map((d) => ({ ...d, valorBRL: d.valorBRL * qtd }));
}

export function outrasDespesasBaseParaContainers(qtdContainers: number): number {
  return OUTRAS_DESPESAS_BASE_POR_CONTAINER * Math.max(1, Math.round(qtdContainers));
}

export function inferirQtdContainers(despesas: Despesa[]): number {
  const afrmm = despesas.find((d) => d.nome.toLowerCase().includes("afrmm"));
  if (afrmm && afrmm.valorBRL > 0) {
    const base = DESPESAS_POR_CONTAINER.find((d) => d.nome.toLowerCase().includes("afrmm"))?.valorBRL ?? 4000;
    return Math.max(1, Math.round(afrmm.valorBRL / base));
  }
  return 1;
}

/** Despesas zeradas (legado) ou lista vazia → aplicar tabela planilha 66. */
export function despesasSemValor(despesas: Despesa[]): boolean {
  return despesas.length === 0 || despesas.every((d) => d.valorBRL === 0);
}

export function despesasParaEditor(atual: Despesa[], qtdContainers = 1): Despesa[] {
  if (!despesasSemValor(atual)) return atual.map((d) => ({ ...d }));
  return despesasParaContainers(qtdContainers);
}

export function totalDespesas(despesas: Despesa[]): number {
  return despesas.reduce((acc, d) => acc + d.valorBRL, 0);
}
