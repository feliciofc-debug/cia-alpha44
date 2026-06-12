/**
 * ICMS na cotação — precedência manual vs resolver (P2.3).
 */

import type { Cotacao, ParamsSaida } from "./schemas.js";
import { normalizarUf, resolverIcmsEfetivo, type RegimeIcms } from "./icms-uf.js";

export interface IcmsCotacaoMeta {
  icmsSaidaEfetivo: number;
  icmsEntradaEfetivo: number;
  fundamentoSaida: string;
  avisoRegimeIcms?: string;
  operacaoInterestadual: boolean;
  icmsSaidaManualFlag: boolean;
  avisosFiscais: string[];
}

export type CotacaoIcmsInput = Pick<
  Cotacao,
  "ufEmpresa" | "destino" | "regimeIcms" | "icmsSaidaManualFlag" | "params" | "avisosFiscais"
>;

const FUNDAMENTO_MANUAL_FLAG = "manual (icmsSaidaManualFlag — valor em params.icmsSaida)";

/** flag=true → params.icmsSaida; flag=false → resolverIcmsEfetivo. avisosFiscais preservados. */
export function aplicarIcmsCotacao(cotacao: CotacaoIcmsInput): {
  params: ParamsSaida;
  meta: IcmsCotacaoMeta;
} {
  const manualFlag = cotacao.icmsSaidaManualFlag ?? false;
  const avisosFiscais = [...(cotacao.avisosFiscais ?? [])];
  const paramsBase = { ...cotacao.params };

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
        fundamentoSaida: FUNDAMENTO_MANUAL_FLAG,
        operacaoInterestadual: destino !== ufEmpresa,
        icmsSaidaManualFlag: true,
        avisosFiscais,
      },
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
    },
    meta: {
      icmsSaidaEfetivo: resolved.icmsSaidaEfetivo,
      icmsEntradaEfetivo: resolved.icmsEntradaEfetivo,
      fundamentoSaida: resolved.fundamentoSaida,
      avisoRegimeIcms: resolved.avisoRegimeIcms,
      operacaoInterestadual: resolved.operacaoInterestadual,
      icmsSaidaManualFlag: false,
      avisosFiscais,
    },
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
