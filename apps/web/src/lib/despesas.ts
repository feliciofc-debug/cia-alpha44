import type { Despesa } from "./types.ts";

/** Despesas operacionais padrão (mesma lista da planilha 66 / @cia/shared). */
export const DESPESAS_PADRAO: Despesa[] = [
  { nome: "AFRMM", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Armazenagem", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Liberação BL", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Registro ANVISA/INMETRO", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Administrativo", valorBRL: 0, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Transp+Esc DTA", valorBRL: 0, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Transporte (destino)", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
  { nome: "Escolta", valorBRL: 0, entraBaseSaida: true, entraBaseNota: false },
  { nome: "Despacho/Honorários", valorBRL: 0, entraBaseSaida: true, entraBaseNota: true },
];

export function despesasParaEditor(atual: Despesa[]): Despesa[] {
  if (atual.length > 0) return atual.map((d) => ({ ...d }));
  return DESPESAS_PADRAO.map((d) => ({ ...d }));
}
