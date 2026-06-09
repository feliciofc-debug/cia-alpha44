import type { Despesa } from "./schemas.js";

/**
 * Despesas locais por container — valores da planilha 66 (Plan1 C24:C32, 1 container).
 * Multiplique por `qtdContainers` para obter o total da operação.
 */
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

/** Base M109 da planilha 66 por container (markup / impostos saída). */
export const OUTRAS_DESPESAS_BASE_POR_CONTAINER = 14_040;

/** Defaults operacionais da planilha 66 (1 container). */
export const DEFAULT_FRETE_US = 3500;
export const DEFAULT_SISCOMEX_BRL = 154.23;

/** Alias legado — despesas para 1 container. */
export const DESPESAS_PADRAO = DESPESAS_POR_CONTAINER;

export function despesasParaContainers(qtdContainers: number): Despesa[] {
  const qtd = Math.max(1, Math.round(qtdContainers));
  return DESPESAS_POR_CONTAINER.map((d) => ({ ...d, valorBRL: d.valorBRL * qtd }));
}

export function despesasSemValor(despesas: Despesa[]): boolean {
  return despesas.length === 0 || despesas.every((d) => d.valorBRL === 0);
}

/** Preenche defaults da planilha 66 quando despesas estão zeradas (legado). */
export function despesasComDefaults(despesas: Despesa[], qtdContainers = 1): Despesa[] {
  if (!despesasSemValor(despesas)) return despesas;
  return despesasParaContainers(qtdContainers);
}

export function outrasDespesasBaseParaContainers(qtdContainers: number): number {
  return OUTRAS_DESPESAS_BASE_POR_CONTAINER * Math.max(1, Math.round(qtdContainers));
}

/** Infere qtd containers a partir do AFRMM salvo (R$ 4.000 por container na planilha 66). */
export function inferirQtdContainers(despesas: Despesa[]): number {
  const afrmm = despesas.find((d) => d.nome.toLowerCase().includes("afrmm"));
  if (afrmm && afrmm.valorBRL > 0) {
    const base = DESPESAS_POR_CONTAINER.find((d) => d.nome.toLowerCase().includes("afrmm"))?.valorBRL ?? 4000;
    return Math.max(1, Math.round(afrmm.valorBRL / base));
  }
  return 1;
}
