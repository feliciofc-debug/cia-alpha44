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
  fonte?: string;
  vigencia?: string | null;
  avisos?: string[];
  /** IPI "NT" na TIPI — não tributado (distinto de 0% explícito ou ausente). */
  ipiNt?: boolean;
}

/** Entrada legada (seed inicial planilha 66) sem metadados. */
export type TecEntryLegado = Pick<TecEntry, "ii" | "ipi" | "pis" | "cofins">;

export interface TecCache {
  fonte: string;
  geradoEm?: string;
  arquivosFonte?: Array<{ arquivo: string; baixadoEm: string | null; url?: string }>;
  pisPadrao: number;
  cofinsPadrao: number;
  fundamentoPisCofinsPadrao?: string;
  cobertura?: {
    ii: { encontrados: number; total: number; percentual: number };
    ipi: { encontrados: number; total: number; percentual: number };
  };
  total?: number;
  itens: Record<string, TecEntry | TecEntryLegado>;
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
  return ncm.replace(/\D/g, "").padStart(8, "0").slice(0, 8);
}

function normalizarEntrada(raw: TecEntry | TecEntryLegado): TecEntry {
  return {
    ii: raw.ii,
    ipi: raw.ipi,
    pis: raw.pis,
    cofins: raw.cofins,
    fonte: "fonte" in raw && raw.fonte ? raw.fonte : undefined,
    vigencia: "vigencia" in raw ? (raw.vigencia ?? null) : null,
    avisos: "avisos" in raw ? raw.avisos : undefined,
    ipiNt: "ipiNt" in raw ? raw.ipiNt : undefined,
  };
}

export function criarTecSource(cache: TecCache): AliquotaSource {
  const itens = cache.itens ?? {};
  const fontePadrao = cache.fonte?.includes("Seed") ? "Cache TEC/TIPI oficial" : "Cache TEC/TIPI";
  return {
    buscar(ncm: string): AliquotaResult {
      const key = normNcm(ncm);
      const raw = itens[key];
      if (raw) {
        const e = normalizarEntrada(raw);
        return {
          encontrado: true,
          fonte: e.fonte ?? fontePadrao,
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
