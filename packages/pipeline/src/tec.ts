/**
 * Cache TEC/TIPI de alíquotas por NCM (II/IPI/PIS/COFINS).
 *
 * Estratégia v1 (decisão de produto): tabela cacheada + override manual por item.
 * A arquitetura é um adapter: `AliquotaSource` pode ser trocada futuramente pelo
 * Classif TT (com certificado digital) sem mudar o resto do pipeline.
 */

import type { Aliquotas } from "@cia/shared";

export interface TecEntry {
  ii: number;
  ipi: number;
  pis: number;
  cofins: number;
}

export interface TecCache {
  fonte: string;
  pisPadrao: number;
  cofinsPadrao: number;
  itens: Record<string, TecEntry>;
}

export interface AliquotaResult {
  aliquotas: Aliquotas;
  encontrado: boolean;
  fonte: string;
}

/** Adapter de fonte de alíquotas (cache local hoje; Classif TT amanhã). */
export interface AliquotaSource {
  buscar(ncm: string): AliquotaResult;
  /** Consulta ao vivo (TTCE/Siscomex) quando disponível. */
  buscarAsync?(ncm: string): Promise<AliquotaResult>;
}

function normNcm(ncm: string): string {
  return ncm.replace(/\D/g, "");
}

export function criarTecSource(cache: TecCache): AliquotaSource {
  return {
    buscar(ncm: string): AliquotaResult {
      const key = normNcm(ncm);
      const e = cache.itens[key];
      if (e) {
        return {
          encontrado: true,
          fonte: "Cache TEC/TIPI",
          aliquotas: { ii: e.ii, ipi: e.ipi, pis: e.pis, cofins: e.cofins, icmsEntrada: 0 },
        };
      }
      return {
        encontrado: false,
        fonte: "sem cache — preencher manualmente",
        aliquotas: { ii: 0, ipi: 0, pis: cache.pisPadrao, cofins: cache.cofinsPadrao, icmsEntrada: 0 },
      };
    },
  };
}
