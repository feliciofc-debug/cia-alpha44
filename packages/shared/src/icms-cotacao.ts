/**
 * ICMS na cotação — precedência manual vs resolver (P2.3) + regime de destino.
 */

import type { Cotacao, ParamsSaida } from "./schemas.js";
import { normalizarUf, resolverIcmsEfetivo, type RegimeIcms } from "./icms-uf.js";
import {
  presetRegimeDestino,
  REGIME_DESTINO_INTEGRAL,
  resolverParamsRegimeDestino,
  type RegimeDestinoId,
  type RegimeDestinoParams,
} from "./regimes-destino.js";

export interface IcmsCotacaoMeta {
  icmsSaidaEfetivo: number;
  icmsEntradaEfetivo: number;
  /** Taxa de antecipação ICMS importação (regime destino). */
  icmsImportacaoAliq: number;
  fundamentoSaida: string;
  avisoRegimeIcms?: string;
  operacaoInterestadual: boolean;
  icmsSaidaManualFlag: boolean;
  avisosFiscais: string[];
  regimeDestinoId: RegimeDestinoId | null;
  regimeDestinoNome?: string;
  regimeDestinoFonteLegal?: string;
  aliqFundos: number;
  difalAliq?: number;
}

export type CotacaoIcmsInput = Pick<
  Cotacao,
  | "ufEmpresa"
  | "destino"
  | "regimeIcms"
  | "icmsSaidaManualFlag"
  | "params"
  | "avisosFiscais"
  | "regimeDestinoId"
  | "regimeDestinoParams"
>;

const FUNDAMENTO_MANUAL_FLAG = "manual (icmsSaidaManualFlag — valor em params.icmsSaida)";

function regimeIdEfetivo(cotacao: CotacaoIcmsInput): RegimeDestinoId | null {
  const id = cotacao.regimeDestinoId;
  if (!id || id === REGIME_DESTINO_INTEGRAL) return null;
  return presetRegimeDestino(id as RegimeDestinoId) ? (id as RegimeDestinoId) : null;
}

/** flag=true → params.icmsSaida; flag=false → resolverIcmsEfetivo ou regime destino. */
export function aplicarIcmsCotacao(cotacao: CotacaoIcmsInput): {
  params: ParamsSaida;
  meta: IcmsCotacaoMeta;
  /** Taxa ICMS entrada por item (antecipação regime destino). */
  icmsEntradaItemAliq: number;
  regimeParams: RegimeDestinoParams | null;
} {
  const manualFlag = cotacao.icmsSaidaManualFlag ?? false;
  const avisosFiscais = [...(cotacao.avisosFiscais ?? [])];
  const paramsBase = { ...cotacao.params, aliqFundos: cotacao.params.aliqFundos ?? 0 };
  const regimeDestinoId = regimeIdEfetivo(cotacao);
  const regimeParams = regimeDestinoId
    ? resolverParamsRegimeDestino(regimeDestinoId, cotacao.regimeDestinoParams)
    : null;
  const preset = regimeDestinoId ? presetRegimeDestino(regimeDestinoId) : null;

  if (manualFlag) {
    const icmsSaida = paramsBase.icmsSaida;
    const icmsEntrada = paramsBase.icmsEntrada ?? 0;
    const ufEmpresa = normalizarUf(cotacao.ufEmpresa ?? "AL") ?? "AL";
    const destino = normalizarUf(cotacao.destino) ?? "SP";
    return {
      params: { ...paramsBase, icmsSaida, icmsEntrada },
      meta: {
        icmsSaidaEfetivo: icmsSaida,
        icmsEntradaEfetivo: icmsEntrada,
        icmsImportacaoAliq: regimeParams?.icmsImportacaoAliq ?? 0,
        fundamentoSaida: FUNDAMENTO_MANUAL_FLAG,
        operacaoInterestadual: destino !== ufEmpresa,
        icmsSaidaManualFlag: true,
        avisosFiscais,
        regimeDestinoId,
        regimeDestinoNome: preset?.nome,
        regimeDestinoFonteLegal: preset?.fonteLegal,
        aliqFundos: paramsBase.aliqFundos ?? 0,
        difalAliq: regimeParams?.difalAliq,
      },
      icmsEntradaItemAliq: regimeParams?.icmsImportacaoAliq ?? 0,
      regimeParams,
    };
  }

  if (regimeParams && preset) {
    const difal = regimeParams.difalAliq ?? 0;
    const icmsSaida = regimeParams.icmsSaidaEfetivaAliq + difal;
    const ufEmpresa = normalizarUf(cotacao.ufEmpresa ?? "AL") ?? "AL";
    const destino = normalizarUf(cotacao.destino) ?? "SP";
    return {
      params: {
        ...paramsBase,
        icmsSaida,
        icmsEntrada: 0,
        aliqFundos: regimeParams.aliqFundos,
      },
      meta: {
        icmsSaidaEfetivo: icmsSaida,
        icmsEntradaEfetivo: 0,
        icmsImportacaoAliq: regimeParams.icmsImportacaoAliq,
        fundamentoSaida: preset.fonteLegal,
        operacaoInterestadual: destino !== ufEmpresa,
        icmsSaidaManualFlag: false,
        avisosFiscais,
        regimeDestinoId,
        regimeDestinoNome: preset.nome,
        regimeDestinoFonteLegal: preset.fonteLegal,
        aliqFundos: regimeParams.aliqFundos,
        difalAliq: regimeParams.difalAliq,
      },
      icmsEntradaItemAliq: regimeParams.icmsImportacaoAliq,
      regimeParams,
    };
  }

  const resolved = resolverIcmsEfetivo({
    ufEmpresa: cotacao.ufEmpresa ?? "AL",
    destino: cotacao.destino,
    regimeIcms: (cotacao.regimeIcms ?? "AL_DIFERIDO") as RegimeIcms,
  });

  return {
    params: {
      ...paramsBase,
      icmsSaida: resolved.icmsSaidaEfetivo,
      icmsEntrada: resolved.icmsEntradaEfetivo,
      aliqFundos: 0,
    },
    meta: {
      icmsSaidaEfetivo: resolved.icmsSaidaEfetivo,
      icmsEntradaEfetivo: resolved.icmsEntradaEfetivo,
      icmsImportacaoAliq: 0,
      fundamentoSaida: resolved.fundamentoSaida,
      avisoRegimeIcms: resolved.avisoRegimeIcms,
      operacaoInterestadual: resolved.operacaoInterestadual,
      icmsSaidaManualFlag: false,
      avisosFiscais,
      regimeDestinoId: null,
      aliqFundos: 0,
    },
    icmsEntradaItemAliq: 0,
    regimeParams: null,
  };
}

/** Nova cotação / recálculo auto — resolver define params.icmsSaida. */
export function icmsParamsNovaCotacao(
  cotacao: CotacaoIcmsInput,
): Pick<Cotacao, "params" | "icmsSaidaManualFlag" | "avisosFiscais"> {
  const applied = aplicarIcmsCotacao({
    ...cotacao,
    icmsSaidaManualFlag: false,
    avisosFiscais: cotacao.avisosFiscais ?? [],
  });
  return {
    params: applied.params,
    icmsSaidaManualFlag: false,
    avisosFiscais: applied.meta.avisosFiscais,
  };
}
