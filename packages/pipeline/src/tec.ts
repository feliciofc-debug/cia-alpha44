/**
 * Cache TEC/TIPI de alíquotas por NCM (II/IPI/PIS/COFINS).
 *
 * Estratégia v1 (decisão de produto): tabela cacheada + override manual por item.
 * A arquitetura é um adapter: `AliquotaSource` pode ser trocada futuramente pelo
 * Classif TT (com certificado digital) sem mudar o resto do pipeline.
 */

import type { Aliquotas, RastroAliquotas } from "@cia/shared";
import { montarRastroTributo, PIS_COFINS_FONTE_PADRAO } from "@cia/shared";

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
  /** Fundamento legal PIS/COFINS (Lei 10.865/2004 ou exceção curada). */
  fundamentoPisCofins?: string;
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
  /** Rastro por tributo — T7. */
  rastros?: RastroAliquotas;
}

/** Adapter de fonte de alíquotas (cache local hoje; Classif TT amanhã). */
export interface AliquotaSource {
  buscar(ncm: string): AliquotaResult;
  /** Consulta ao vivo (TTCE/Siscomex) quando disponível. */
  buscarAsync?(ncm: string): Promise<AliquotaResult>;
}

const FUNDAMENTO_PIS_COFINS_AUTOPECAS =
  "Lei 10.865/2004, art. 8º, §9-A; autopeça — Lista MDIC Regime Autopeças (Lei 10.485/2002)";
const FUNDAMENTO_PIS_COFINS_SEC3 = "Lei 10.865/2004, art. 8º, §3 (Lei 13.137/2015)";

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
    fundamentoPisCofins:
      "fundamentoPisCofins" in raw && raw.fundamentoPisCofins ? raw.fundamentoPisCofins : undefined,
  };
}

function parseVigenciaParte(vigencia: string | null | undefined, tributo: "II" | "IPI"): string | undefined {
  if (!vigencia) return undefined;
  if (tributo === "II") {
    const m = vigencia.match(/II:\s*([^|]+)/);
    return m?.[1]?.trim();
  }
  const m = vigencia.match(/IPI:\s*(.+)$/);
  return m?.[1]?.trim();
}

function fonteLegalII(entry: TecEntry, cache: TecCache): string {
  const fromVig = parseVigenciaParte(entry.vigencia, "II");
  if (fromVig) return fromVig;
  const mdic = entry.fonte?.split(" + ")[0]?.trim();
  if (mdic) return mdic;
  return cache.fonte ?? "TEC Res. Gecex — cache MDIC";
}

function fonteLegalIPI(entry: TecEntry): string {
  const fromVig = parseVigenciaParte(entry.vigencia, "IPI");
  if (fromVig) return fromVig;
  const tipi = entry.fonte?.split(" + ")[1]?.trim();
  if (tipi) return tipi;
  return "TIPI RFB vigente";
}

function fundamentoPisCofins(entry: TecEntry, cache: TecCache): string {
  if (entry.fundamentoPisCofins) return entry.fundamentoPisCofins;
  const padrao = cache.fundamentoPisCofinsPadrao ?? PIS_COFINS_FONTE_PADRAO;
  if (entry.pis === 0.0312 && entry.cofins === 0.1437) return FUNDAMENTO_PIS_COFINS_AUTOPECAS;
  if (entry.pis === 0.0175 && entry.cofins === 0.076) return FUNDAMENTO_PIS_COFINS_SEC3;
  return padrao;
}

export function montarRastrosCache(
  aliquotas: Aliquotas,
  entry: TecEntry | null,
  cache: TecCache,
  consultadoEm: string,
): RastroAliquotas {
  const pisCofinsFonte = entry
    ? fundamentoPisCofins(entry, cache)
    : (cache.fundamentoPisCofinsPadrao ?? PIS_COFINS_FONTE_PADRAO);

  return {
    ii: montarRastroTributo(
      aliquotas.ii,
      "tec-cache",
      entry ? fonteLegalII(entry, cache) : "sem cache — preencher manualmente",
      consultadoEm,
    ),
    ipi: montarRastroTributo(
      aliquotas.ipi,
      "tec-cache",
      entry ? fonteLegalIPI(entry) : "sem cache — preencher manualmente",
      consultadoEm,
    ),
    pis: montarRastroTributo(aliquotas.pis, "tec-cache", pisCofinsFonte, consultadoEm),
    cofins: montarRastroTributo(aliquotas.cofins, "tec-cache", pisCofinsFonte, consultadoEm),
  };
}

export function criarTecSource(cache: TecCache): AliquotaSource {
  const itens = cache.itens ?? {};
  const fontePadrao = cache.fonte?.includes("Seed") ? "Cache TEC/TIPI oficial" : "Cache TEC/TIPI";
  const consultadoEm = cache.geradoEm ?? new Date().toISOString();

  return {
    buscar(ncm: string): AliquotaResult {
      const key = normNcm(ncm);
      const raw = itens[key];
      if (raw) {
        const e = normalizarEntrada(raw);
        const aliquotas = { ii: e.ii, ipi: e.ipi, pis: e.pis, cofins: e.cofins, icmsEntrada: 0 };
        return {
          encontrado: true,
          fonte: e.fonte ?? fontePadrao,
          aliquotas,
          rastros: montarRastrosCache(aliquotas, e, cache, consultadoEm),
        };
      }
      const aliquotas = {
        ii: 0,
        ipi: 0,
        pis: cache.pisPadrao,
        cofins: cache.cofinsPadrao,
        icmsEntrada: 0,
      };
      return {
        encontrado: false,
        fonte: "sem cache — preencher manualmente",
        aliquotas,
        rastros: montarRastrosCache(aliquotas, null, cache, consultadoEm),
      };
    },
  };
}
