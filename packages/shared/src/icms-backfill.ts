/**
 * Auditoria conservadora de ICMS salvo vs resolver — P2.2 backfill / migração.
 * Nunca altera icmsSaida; só classifica manualFlag + avisos.
 */

import { resolverIcmsEfetivo, type RegimeIcms } from "./icms-uf.js";

export const TOLERANCIA_ICMS_SAIDA = 0.0001;

export function formatPctIcms(decimal: number): string {
  return (decimal * 100).toFixed(2).replace(/\.?0+$/, "");
}

export function avisoIcmsLegadoDivergente(
  icmsSalvo: number,
  calculado: number,
  fundamento: string,
): string {
  return `ICMS de saída legado (${formatPctIcms(icmsSalvo)}%) difere do calculado (${formatPctIcms(calculado)}% — ${fundamento}) — revisar e confirmar`;
}

export interface AuditarIcmsSaidaLegadoInput {
  icmsSaidaSalvo: number;
  ufEmpresa?: string;
  destino: string;
  regimeIcms?: RegimeIcms;
}

export interface AuditarIcmsSaidaLegadoResult {
  icmsSaidaManualFlag: boolean;
  avisosFiscais: string[];
  icmsSaidaCalculado: number;
  fundamentoCalculado: string;
}

/** Compara valor persistido com resolver — sem mutar icmsSaida. */
export function auditarIcmsSaidaLegado(input: AuditarIcmsSaidaLegadoInput): AuditarIcmsSaidaLegadoResult {
  const resolved = resolverIcmsEfetivo({
    ufEmpresa: input.ufEmpresa ?? "AL",
    destino: input.destino,
    regimeIcms: input.regimeIcms ?? "AL_DIFERIDO",
  });
  const calc = resolved.icmsSaidaEfetivo;
  const salvo = input.icmsSaidaSalvo;
  if (Math.abs(salvo - calc) <= TOLERANCIA_ICMS_SAIDA) {
    return {
      icmsSaidaManualFlag: false,
      avisosFiscais: [],
      icmsSaidaCalculado: calc,
      fundamentoCalculado: resolved.fundamentoSaida,
    };
  }
  return {
    icmsSaidaManualFlag: true,
    avisosFiscais: [avisoIcmsLegadoDivergente(salvo, calc, resolved.fundamentoSaida)],
    icmsSaidaCalculado: calc,
    fundamentoCalculado: resolved.fundamentoSaida,
  };
}

/** Defaults para cotação nova (P2.2 — resolver entra em P2.3 no recálculo). */
export function defaultsIcmsPersistencia(): {
  ufEmpresa: string;
  regimeIcms: RegimeIcms;
  icmsSaidaManualFlag: boolean;
  avisosFiscais: string[];
} {
  return {
    ufEmpresa: "AL",
    regimeIcms: "AL_DIFERIDO",
    icmsSaidaManualFlag: false,
    avisosFiscais: [],
  };
}
